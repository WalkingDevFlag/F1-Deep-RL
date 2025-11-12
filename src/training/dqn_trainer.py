import logging
import os
import random
import time
from dataclasses import dataclass
from typing import Any, Deque, Dict, List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from collections import deque

logger = logging.getLogger(__name__)


@dataclass
class TrainingConfig:
    """Hyper-parameters and runtime configuration for the DQN trainer."""

    state_size: int
    action_size: int
    replay_buffer_size: int = 50_000
    batch_size: int = 64
    gamma: float = 0.99
    learning_rate: float = 1e-4
    train_frequency: int = 4
    target_update_frequency: int = 1_000
    start_epsilon: float = 1.0
    end_epsilon: float = 0.05
    epsilon_decay_steps: int = 50_000
    save_every_steps: int = 10_000
    max_training_steps: int = 500_000
    min_replay_size: int = 1_000
    device: str = "cpu"
    checkpoint_dir: Optional[str] = None
    seed: Optional[int] = None

    def __post_init__(self) -> None:
        if self.checkpoint_dir is None:
            project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
            self.checkpoint_dir = os.path.join(project_root, "checkpoints")
        os.makedirs(self.checkpoint_dir, exist_ok=True)
        if self.train_frequency <= 0:
            raise ValueError("train_frequency must be > 0")
        if self.batch_size <= 0:
            raise ValueError("batch_size must be > 0")
        if self.state_size <= 0 or self.action_size <= 0:
            raise ValueError("state_size and action_size must be > 0")


class ReplayBuffer:
    """Simple FIFO replay buffer."""

    def __init__(self, capacity: int) -> None:
        self.capacity = int(capacity)
        self.buffer: Deque[Tuple[np.ndarray, int, float, np.ndarray, bool]] = deque(maxlen=self.capacity)

    def __len__(self) -> int:
        return len(self.buffer)

    def push(self, state: np.ndarray, action: int, reward: float, next_state: np.ndarray, done: bool) -> None:
        self.buffer.append((state, action, reward, next_state, done))

    def sample(self, batch_size: int) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        batch = random.sample(self.buffer, batch_size)
        states, actions, rewards, next_states, dones = zip(*batch)
        states_arr = np.stack(states).astype(np.float32)
        actions_arr = np.array(actions, dtype=np.int64)
        rewards_arr = np.array(rewards, dtype=np.float32)
        next_states_arr = np.stack(next_states).astype(np.float32)
        dones_arr = np.array(dones, dtype=np.float32)
        return states_arr, actions_arr, rewards_arr, next_states_arr, dones_arr


class DQNNetwork(nn.Module):
    """Simple feed-forward network for value approximation."""

    def __init__(self, input_dim: int, output_dim: int) -> None:
        super().__init__()
        hidden = max(128, input_dim * 2)
        self.model = nn.Sequential(
            nn.Linear(input_dim, hidden),
            nn.ReLU(),
            nn.Linear(hidden, hidden),
            nn.ReLU(),
            nn.Linear(hidden, output_dim),
        )

        for layer in self.model:
            if isinstance(layer, nn.Linear):
                nn.init.kaiming_uniform_(layer.weight, nonlinearity="relu")
                nn.init.zeros_(layer.bias)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.model(x)


class DQNTrainer:
    """Encapsulates DQN training lifecycle and online interaction hooks."""

    def __init__(self, config: TrainingConfig) -> None:
        self.config = config
        if config.seed is not None:
            random.seed(config.seed)
            np.random.seed(config.seed)
            torch.manual_seed(config.seed)

        self.device = torch.device(config.device)
        self.policy_net = DQNNetwork(config.state_size, config.action_size).to(self.device)
        self.target_net = DQNNetwork(config.state_size, config.action_size).to(self.device)
        self.target_net.load_state_dict(self.policy_net.state_dict())
        self.target_net.eval()

        self.optimizer = optim.Adam(self.policy_net.parameters(), lr=config.learning_rate)
        self.replay_buffer = ReplayBuffer(config.replay_buffer_size)

        self.total_steps: int = 0
        self.training_steps: int = 0
        self.last_save_step: int = 0
        self.running: bool = False
        self.epsilon: float = config.start_epsilon
        self.last_episode_return: float = 0.0
        self.current_episode_return: float = 0.0
        self.current_episode_length: int = 0

    def start(self) -> None:
        if not self.running:
            logger.info("Trainer start requested")
            self.running = True

    def stop(self) -> None:
        if self.running:
            logger.info("Trainer stop requested")
            self.running = False
            self._flush_checkpoints()

    def reset_episode(self) -> None:
        self.last_episode_return = self.current_episode_return
        self.current_episode_return = 0.0
        self.current_episode_length = 0

    def select_action(self, state: np.ndarray) -> int:
        state_tensor = torch.from_numpy(state.astype(np.float32)).to(self.device).unsqueeze(0)
        greedy_action = int(torch.argmax(self.policy_net(state_tensor), dim=1).item())
        if not self.running:
            return greedy_action

        if random.random() < self.epsilon:
            action = random.randrange(self.config.action_size)
        else:
            action = greedy_action
        return action

    def default_action(self) -> int:
        """Return a safe default action when no policy decision is required."""
        return 0

    def record_transition(self, state: np.ndarray, action: int, reward: float, next_state: np.ndarray, done: bool) -> Dict[str, float]:
        reward = float(reward)
        self.replay_buffer.push(state.astype(np.float32), action, reward, next_state.astype(np.float32), done)
        self.total_steps += 1
        self.current_episode_return += reward
        self.current_episode_length += 1

        metrics: Dict[str, float] = {
            "epsilon": self.epsilon,
            "buffer_size": float(len(self.replay_buffer)),
            "total_steps": float(self.total_steps),
        }

        if self.running and len(self.replay_buffer) >= self.config.min_replay_size:
            if self.total_steps % self.config.train_frequency == 0:
                loss = self._learn()
                if loss is not None:
                    metrics["loss"] = loss
            if self.total_steps % self.config.target_update_frequency == 0:
                self._sync_target_network()
            if self.total_steps % self.config.save_every_steps == 0:
                self._save_checkpoint_async()
            if self.total_steps >= self.config.max_training_steps:
                logger.info("Maximum training steps reached; stopping trainer")
                self.stop()

        self._update_epsilon()

        if done:
            self.reset_episode()

        return metrics

    def _learn(self) -> Optional[float]:
        if len(self.replay_buffer) < self.config.batch_size:
            return None

        states, actions, rewards, next_states, dones = self.replay_buffer.sample(self.config.batch_size)

        states_tensor = torch.from_numpy(states).to(self.device)
        actions_tensor = torch.from_numpy(actions).long().to(self.device)
        rewards_tensor = torch.from_numpy(rewards).to(self.device)
        next_states_tensor = torch.from_numpy(next_states).to(self.device)
        dones_tensor = torch.from_numpy(dones).to(self.device)

        q_values = self.policy_net(states_tensor).gather(1, actions_tensor.unsqueeze(1)).squeeze(1)
        with torch.no_grad():
            next_q_values = self.target_net(next_states_tensor).max(1)[0]
            target_q = rewards_tensor + self.config.gamma * next_q_values * (1 - dones_tensor)

        loss = nn.functional.smooth_l1_loss(q_values, target_q)
        self.optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(self.policy_net.parameters(), max_norm=10.0)
        self.optimizer.step()

        self.training_steps += 1
        return float(loss.item())

    def _sync_target_network(self) -> None:
        self.target_net.load_state_dict(self.policy_net.state_dict())
        logger.debug("Target network synchronised at step %s", self.total_steps)

    def _update_epsilon(self) -> None:
        if not self.running:
            self.epsilon = max(self.config.end_epsilon, self.epsilon * 0.995)
            return

        decay_ratio = min(1.0, self.total_steps / max(1, self.config.epsilon_decay_steps))
        epsilon_range = self.config.start_epsilon - self.config.end_epsilon
        self.epsilon = self.config.start_epsilon - decay_ratio * epsilon_range
        self.epsilon = max(self.config.end_epsilon, self.epsilon)

    def _save_checkpoint_async(self) -> None:
        # For now the save is synchronous, but kept separate for future threading if needed.
        self._save_checkpoint()

    def _save_checkpoint(self) -> str:
        timestamp = int(time.time())
        filename = f"dqn_step_{self.total_steps}_ts_{timestamp}.pt"
        path = os.path.join(self.config.checkpoint_dir, filename)

        payload = {
            "policy_state_dict": self.policy_net.state_dict(),
            "target_state_dict": self.target_net.state_dict(),
            "optimizer_state_dict": self.optimizer.state_dict(),
            "total_steps": self.total_steps,
            "training_steps": self.training_steps,
            "epsilon": self.epsilon,
            "config": self.config.__dict__,
        }
        torch.save(payload, path)
        self.last_save_step = self.total_steps
        logger.info("Saved DQN checkpoint to %s", path)
        return path

    def _flush_checkpoints(self) -> None:
        if self.total_steps != self.last_save_step:
            try:
                self._save_checkpoint()
            except Exception as exc:  # pragma: no cover - defensive logging
                logger.exception("Failed to save checkpoint on shutdown: %s", exc)

    def get_status(self) -> Dict[str, float]:
        return {
            "running": self.running,
            "epsilon": self.epsilon,
            "total_steps": self.total_steps,
            "training_steps": self.training_steps,
            "buffer_size": len(self.replay_buffer),
            "last_episode_return": self.last_episode_return,
            "current_episode_return": self.current_episode_return,
            "current_episode_length": self.current_episode_length,
        }

    def load_checkpoint(self, path: str) -> None:
        if not os.path.exists(path):
            raise FileNotFoundError(path)
        payload = torch.load(path, map_location=self.device)
        self.policy_net.load_state_dict(payload["policy_state_dict"])
        self.target_net.load_state_dict(payload["target_state_dict"])
        self.optimizer.load_state_dict(payload["optimizer_state_dict"])
        self.total_steps = int(payload.get("total_steps", 0))
        self.training_steps = int(payload.get("training_steps", 0))
        self.epsilon = float(payload.get("epsilon", self.config.start_epsilon))
        logger.info("Loaded checkpoint from %s", path)

    def inspect_network(self, state: np.ndarray) -> Dict[str, Any]:
        """Capture the current network topology, activations, and weights."""
        if not isinstance(state, np.ndarray):
            state = np.asarray(state, dtype=np.float32)
        else:
            state = state.astype(np.float32, copy=False)

        modules = list(self.policy_net.model)
        activation_layers = [np.round(state, 4).tolist()]
        layer_sizes: List[int] = [self.config.state_size]
        weight_matrices: List[List[List[float]]] = []

        tensor = torch.from_numpy(state).to(self.device).unsqueeze(0)

        activation_types = (nn.ReLU, nn.Sigmoid, nn.Tanh, nn.LeakyReLU, nn.SELU, nn.ELU, nn.PReLU, nn.Softplus)

        for idx, layer in enumerate(modules):
            tensor = layer(tensor)

            if isinstance(layer, nn.Linear):
                weights = layer.weight.detach().cpu().numpy().astype(np.float32)
                weight_matrices.append(np.transpose(weights).round(4).tolist())

                next_layer = modules[idx + 1] if idx + 1 < len(modules) else None
                if isinstance(next_layer, activation_types):
                    continue

                vector = tensor.detach().cpu().squeeze(0).numpy().astype(np.float32)
                activation_layers.append(np.round(vector, 4).tolist())
                layer_sizes.append(vector.shape[0])
            elif isinstance(layer, activation_types):
                vector = tensor.detach().cpu().squeeze(0).numpy().astype(np.float32)
                activation_layers.append(np.round(vector, 4).tolist())
                layer_sizes.append(vector.shape[0])

        max_weight = 1e-6
        for matrix in weight_matrices:
            for column in matrix:
                for value in column:
                    abs_val = abs(value)
                    if abs_val > max_weight:
                        max_weight = abs_val

        return {
            "layers": layer_sizes,
            "activations": activation_layers,
            "weights": weight_matrices,
            "max_weight": float(round(max_weight, 6)),
        }


def available_agents() -> Dict[str, Dict[str, str]]:
    """Expose metadata for UI dropdowns."""
    return {
        "DQN": {
            "label": "DQN",
            "description": "Deep Q-Network agent with experience replay",
        }
    }
