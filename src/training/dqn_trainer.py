import hashlib
import json
import logging
import os
import random
from dataclasses import dataclass
from typing import Any, Deque, Dict, List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from collections import deque
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)
# Dedicated reward logger
reward_logger = logging.getLogger("training.reward")


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
    epsilon_decay_steps: int = 100_000
    save_every_steps: int = 10_000
    max_training_steps: int = 500_000
    min_replay_size: int = 500 #1_000
    device: str = "auto"
    checkpoint_dir: Optional[str] = None
    seed: Optional[int] = None
    resume_mode: str = "auto"  # one of {auto, fresh, resume}
    run_id: Optional[str] = None
    policy_version: str = "default"
    policy_signature: Optional[str] = None
    run_subdir: str = ""
    manifest_filename: str = "manifest.json"
    single_run_mode: bool = True

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

        valid_modes = {"auto", "fresh", "resume"}
        if self.resume_mode not in valid_modes:
            raise ValueError(f"resume_mode must be one of {sorted(valid_modes)}")

        if self.run_id is not None:
            self.run_id = self.run_id.strip()
            if not self.run_id:
                raise ValueError("run_id cannot be empty when provided")

        self.policy_version = self.policy_version.strip() or "default"
        if os.path.sep in self.run_subdir:
            raise ValueError("run_subdir should be a single directory name")
        if not self.manifest_filename.endswith(".json"):
            raise ValueError("manifest_filename must be a JSON file name")

        if not isinstance(self.single_run_mode, bool):
            raise TypeError("single_run_mode must be a boolean")

        if self.device == "auto":
            self.device = "cuda" if torch.cuda.is_available() else "cpu"


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


class RunStateError(RuntimeError):
    """Raised when run state or manifest handling fails."""


class RunManager:
    """Handles run directory resolution and manifest persistence."""

    HISTORY_LIMIT = 25

    def __init__(
        self,
        base_dir: str,
        resume_mode: str,
        run_id: Optional[str],
        manifest_filename: str,
        policy_version: str,
        config_fingerprint: str,
        policy_signature: Optional[str] = None,
        single_run: bool = False,
    ) -> None:
        self._base_dir = Path(base_dir)
        self._resume_mode = resume_mode
        self._requested_run_id = run_id
        self._manifest_name = manifest_filename
        self._policy_version = policy_version
        self._policy_signature = policy_signature
        self._config_fingerprint = config_fingerprint
        self._single_run = bool(single_run)

        self.run_id: Optional[str] = None
        self.run_dir: Optional[Path] = None
        self.manifest_path: Optional[Path] = None
        self.manifest: Dict[str, Any] = {}
        self.resumed: bool = False

        self._initialise()

    # Public API ---------------------------------------------------------
    def record_checkpoint(self, step: int, training_steps: int, checkpoint_path: Path) -> None:
        if not self.manifest_path:
            raise RunStateError("Manifest path is not initialised")

        checkpoint_entry = {
            "step": int(step),
            "training_steps": int(training_steps),
            "path": str(checkpoint_path),
            "created_at": self._utc_now(),
        }

        history: List[Dict[str, Any]] = self.manifest.setdefault("checkpoints", [])
        history.append(checkpoint_entry)
        if len(history) > self.HISTORY_LIMIT:
            del history[:-self.HISTORY_LIMIT]

        self.manifest.update(
            {
                "total_steps": int(step),
                "training_steps": int(training_steps),
                "last_checkpoint": checkpoint_entry,
                "updated_at": self._utc_now(),
            }
        )
        self._write_manifest()

    def update_progress(self, step: int, training_steps: int) -> None:
        if not self.manifest_path:
            raise RunStateError("Manifest path is not initialised")
        self.manifest.update(
            {
                "total_steps": int(step),
                "training_steps": int(training_steps),
                "updated_at": self._utc_now(),
            }
        )
        self._write_manifest()

    # Internal helpers ---------------------------------------------------
    def _initialise(self) -> None:
        self._base_dir.mkdir(parents=True, exist_ok=True)

        if self._single_run:
            self._initialise_single_run()
            return

        if self._resume_mode == "fresh":
            self._start_new_run()
            return

        if self._resume_mode == "resume":
            if not self._requested_run_id:
                raise RunStateError("resume_mode 'resume' requires a run_id")
            self._load_existing_run(self._requested_run_id)
            return

        # auto mode
        if self._requested_run_id:
            try:
                self._load_existing_run(self._requested_run_id)
                return
            except (FileNotFoundError, RunStateError):
                pass
        self._start_new_run()

    def _initialise_single_run(self) -> None:
        manifest_path = self._base_dir / self._manifest_name if self._manifest_name else None

        self.run_id = "session"
        self.run_dir = self._base_dir
        self.manifest_path = manifest_path

        if self._resume_mode == "fresh" and manifest_path and manifest_path.exists():
            manifest_path.unlink()

        if manifest_path and manifest_path.exists() and self._resume_mode != "fresh":
            with manifest_path.open("r", encoding="utf-8") as handle:
                manifest = json.load(handle)

            stored_fingerprint = manifest.get("config_fingerprint")
            stored_policy_version = manifest.get("policy_version")
            stored_signature = manifest.get("policy_signature")

            if stored_fingerprint != self._config_fingerprint or stored_policy_version != self._policy_version:
                if manifest_path and manifest_path.exists():
                    manifest_path.unlink()
                self._create_new_manifest()
                return

            if self._policy_signature and stored_signature != self._policy_signature:
                if manifest_path and manifest_path.exists():
                    manifest_path.unlink()
                self._create_new_manifest()
                return

            self.manifest = manifest
            self.resumed = True
        else:
            self._create_new_manifest()

    def _create_new_manifest(self) -> None:
        self.resumed = False
        self.manifest = {
            "run_id": self.run_id or "session",
            "created_at": self._utc_now(),
            "policy_version": self._policy_version,
            "policy_signature": self._policy_signature,
            "config_fingerprint": self._config_fingerprint,
            "total_steps": 0,
            "training_steps": 0,
            "checkpoints": [],
            "updated_at": self._utc_now(),
        }
        if self.manifest_path:
            self._write_manifest()

    def _start_new_run(self) -> None:
        base_run_id = self._requested_run_id or f"run_{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}"
        run_id = base_run_id
        counter = 1
        run_dir = self._base_dir / run_id
        while run_dir.exists():
            run_id = f"{base_run_id}-{counter:02d}"
            run_dir = self._base_dir / run_id
            counter += 1

        run_dir.mkdir(parents=True, exist_ok=False)
        manifest_path = run_dir / self._manifest_name

        self.run_id = run_id
        self.run_dir = run_dir
        self.manifest_path = manifest_path
        self.resumed = False

        self._create_new_manifest()

    def _load_existing_run(self, run_id: str) -> None:
        run_dir = self._base_dir / run_id
        manifest_path = run_dir / self._manifest_name
        if not run_dir.exists():
            raise FileNotFoundError(f"Run directory '{run_id}' does not exist")
        if not manifest_path.exists():
            raise RunStateError(f"Manifest missing for run '{run_id}'")

        with manifest_path.open("r", encoding="utf-8") as handle:
            manifest = json.load(handle)

        stored_fingerprint = manifest.get("config_fingerprint")
        stored_policy_version = manifest.get("policy_version")
        stored_signature = manifest.get("policy_signature")

        if stored_fingerprint != self._config_fingerprint or stored_policy_version != self._policy_version:
            raise RunStateError(
                "Training configuration or policy version changed; start a fresh run instead of resuming."
            )

        if self._policy_signature and stored_signature != self._policy_signature:
            raise RunStateError("Policy signature mismatch; start a fresh run.")

        self.run_id = run_id
        self.run_dir = run_dir
        self.manifest_path = manifest_path
        self.manifest = manifest
        self.resumed = True

    def _write_manifest(self) -> None:
        if not self.manifest_path:
            raise RunStateError("Manifest path is not initialised")
        tmp_path = self.manifest_path.with_suffix(".tmp")
        with tmp_path.open("w", encoding="utf-8") as handle:
            json.dump(self.manifest, handle, indent=2, sort_keys=True)
        os.replace(tmp_path, self.manifest_path)

    @staticmethod
    def _utc_now() -> str:
        return datetime.utcnow().isoformat(timespec="seconds") + "Z"

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
        logger.info("Initialising DQNTrainer on device %s", self.device)
        self.policy_net = DQNNetwork(config.state_size, config.action_size).to(self.device)
        self.target_net = DQNNetwork(config.state_size, config.action_size).to(self.device)
        self.target_net.load_state_dict(self.policy_net.state_dict())
        self.target_net.eval()

        self.optimizer = optim.Adam(self.policy_net.parameters(), lr=config.learning_rate)
        self.replay_buffer = ReplayBuffer(config.replay_buffer_size)

        self.total_steps = 0
        self.training_steps = 0
        self.last_save_step = 0
        self.running = False
        self.epsilon = self.config.start_epsilon
        self.last_episode_return = 0.0
        self.current_episode_return = 0.0
        self.current_episode_length = 0
        self._max_steps_notice_emitted = False

        self._config_fingerprint = self._compute_config_fingerprint()
        self._run_manager = None
        self._run_id = None
        self._run_dir = None
        self._initialise_run_state()

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
                    metrics["loss"] = float(loss)
            if self.total_steps % self.config.target_update_frequency == 0:
                self._sync_target_network()
            if self.total_steps % self.config.save_every_steps == 0:
                self._save_checkpoint_async()
            if self.total_steps >= self.config.max_training_steps:
                if not self._max_steps_notice_emitted:
                    logger.info(
                        "Maximum training steps reached (%s); continuing until manual stop",
                        self.config.max_training_steps,
                    )
                    self._max_steps_notice_emitted = True

        self._update_epsilon()

        try:
            loss_value = metrics.get("loss") if metrics else float("nan")
            reward_log = {
                "kind": "REWARD_STEP",
                "ts": self._utc_now(),
                "total_steps": int(self.total_steps),
                "training_steps": int(self.training_steps),
                "step_reward": float(reward),
                "epsilon": float(self.epsilon),
                "buffer_size": int(len(self.replay_buffer)),
                "running": bool(self.running),
                "loss": float(loss_value) if loss_value is not None else float("nan"),
                "episode_return_so_far": float(self.current_episode_return),
                "episode_length_so_far": int(self.current_episode_length),
            }
            reward_logger.info(json.dumps(reward_log, separators=(",", ":")))
        except Exception:  # pragma: no cover - defensive logging
            logger.exception("Failed to log reward step")

        if done:
            try:
                episode_log = {
                    "kind": "REWARD_EPISODE",
                    "ts": self._utc_now(),
                    "run_id": self._run_id,
                    "total_steps": int(self.total_steps),
                    "training_steps": int(self.training_steps),
                    "episode_return": float(self.current_episode_return),
                    "episode_length": int(self.current_episode_length),
                    "epsilon_end": float(self.epsilon),
                }
                reward_logger.info(json.dumps(episode_log, separators=(",", ":")))
            except Exception:  # pragma: no cover - defensive logging
                logger.exception("Failed to log reward episode")
            self.reset_episode()

        return metrics

    # ------------------------------------------------------------------
    def _initialise_run_state(self) -> None:
        run_root = Path(self.config.checkpoint_dir)
        if not self.config.single_run_mode and self.config.run_subdir:
            run_root = run_root / self.config.run_subdir
        manager = RunManager(
            base_dir=str(run_root),
            resume_mode=self.config.resume_mode,
            run_id=self.config.run_id,
            manifest_filename=self.config.manifest_filename,
            policy_version=self.config.policy_version,
            config_fingerprint=self._config_fingerprint,
            policy_signature=self.config.policy_signature,
            single_run=self.config.single_run_mode,
        )

        self._run_manager = manager
        self._run_id = manager.run_id
        self._run_dir = manager.run_dir

        if not self._run_dir:
            raise RunStateError("Run directory was not initialised")

        self.active_run_dir = str(self._run_dir)

        if manager.resumed:
            last_checkpoint_info = manager.manifest.get("last_checkpoint") or {}
            checkpoint_path = last_checkpoint_info.get("path")
            if checkpoint_path:
                if not os.path.exists(checkpoint_path):
                    raise RunStateError(
                        "Last checkpoint referenced in manifest is missing; start a fresh run instead."
                    )
                self.load_checkpoint(checkpoint_path)
            else:
                self.total_steps = int(manager.manifest.get("total_steps", 0))
                self.training_steps = int(manager.manifest.get("training_steps", 0))
                self.last_save_step = self.total_steps
        else:
            self.total_steps = 0
            self.training_steps = 0
            self.last_save_step = 0
            self.epsilon = self.config.start_epsilon

    def _compute_config_fingerprint(self) -> str:
        snapshot_keys = [
            "state_size",
            "action_size",
            "replay_buffer_size",
            "batch_size",
            "gamma",
            "learning_rate",
            "train_frequency",
            "target_update_frequency",
            "start_epsilon",
            "end_epsilon",
            "epsilon_decay_steps",
            "save_every_steps",
            "max_training_steps",
            "min_replay_size",
            "policy_version",
        ]
        snapshot: Dict[str, Any] = {key: getattr(self.config, key) for key in snapshot_keys}
        if self.config.policy_signature:
            snapshot["policy_signature"] = self.config.policy_signature

        serialised = json.dumps(snapshot, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(serialised.encode("utf-8")).hexdigest()

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
        # Only decay epsilon while the trainer is actively running episodes.
        if not self.running:
            return

        decay_ratio = min(1.0, self.total_steps / max(1, self.config.epsilon_decay_steps))
        epsilon_range = self.config.start_epsilon - self.config.end_epsilon
        self.epsilon = self.config.start_epsilon - decay_ratio * epsilon_range
        self.epsilon = max(self.config.end_epsilon, self.epsilon)

    def _save_checkpoint_async(self) -> None:
        # For now the save is synchronous, but kept separate for future threading if needed.
        self._save_checkpoint()

    def _save_checkpoint(self) -> str:
        if not self._run_dir:
            raise RunStateError("Cannot save checkpoint without an active run directory")

        timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
        step_fragment = f"{self.total_steps:09d}"
        base_name = self._run_id or "run"
        filename = f"{base_name}_step_{step_fragment}_ts_{timestamp}.pt"
        path = self._run_dir / filename

        payload = {
            "policy_state_dict": self.policy_net.state_dict(),
            "target_state_dict": self.target_net.state_dict(),
            "optimizer_state_dict": self.optimizer.state_dict(),
            "total_steps": self.total_steps,
            "training_steps": self.training_steps,
            "epsilon": self.epsilon,
            "run_id": self._run_id,
            "config_fingerprint": self._config_fingerprint,
            "config": self.config.__dict__,
        }
        torch.save(payload, str(path))
        self.last_save_step = self.total_steps
        if self._run_manager:
            self._run_manager.record_checkpoint(self.total_steps, self.training_steps, path)
        logger.info("Saved DQN checkpoint to %s", path)
        return str(path)

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
            "steps": self.total_steps,
            "training_steps": self.training_steps,
            "buffer_size": len(self.replay_buffer),
            "last_episode_return": self.last_episode_return,
            "current_episode_return": self.current_episode_return,
            "current_episode_length": self.current_episode_length,
            "run_id": self._run_id,
            "run_directory": str(self._run_dir) if self._run_dir else None,
            "device": str(self.device),
        }

    def load_checkpoint(self, path: str) -> None:
        if not os.path.exists(path):
            raise FileNotFoundError(path)
        payload = torch.load(path, map_location=self.device)

        checkpoint_fingerprint = payload.get("config_fingerprint")
        if checkpoint_fingerprint and checkpoint_fingerprint != self._config_fingerprint:
            raise RunStateError(
                "Checkpoint fingerprint does not match current training config; start a fresh run."
            )

        checkpoint_run_id = payload.get("run_id")
        if self._run_id and checkpoint_run_id and checkpoint_run_id != self._run_id:
            logger.warning(
                "Loaded checkpoint run_id (%s) differs from active run (%s)",
                checkpoint_run_id,
                self._run_id,
            )
        self.policy_net.load_state_dict(payload["policy_state_dict"])
        self.target_net.load_state_dict(payload["target_state_dict"])
        self.optimizer.load_state_dict(payload["optimizer_state_dict"])
        self.total_steps = int(payload.get("total_steps", 0))
        self.training_steps = int(payload.get("training_steps", 0))
        self.epsilon = float(payload.get("epsilon", self.config.start_epsilon))
        self.last_save_step = self.total_steps
        if self._run_manager:
            try:
                self._run_manager.update_progress(self.total_steps, self.training_steps)
            except RunStateError as exc:
                logger.warning("Failed to update run manifest after load: %s", exc)
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

    @staticmethod
    def _utc_now() -> str:
        return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def available_agents() -> Dict[str, Dict[str, str]]:
    """Expose metadata for UI dropdowns."""
    return {
        "DQN": {
            "label": "DQN",
            "description": "Deep Q-Network agent with experience replay",
        }
    }
