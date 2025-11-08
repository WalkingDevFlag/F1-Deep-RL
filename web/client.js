const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let trackImg = new Image();
let carImg = new Image();
let offscreenCanvas = document.createElement('canvas');
let offscreenCtx = offscreenCanvas.getContext('2d');
let scaleX, scaleY;

let car = { x: 400, y: 300, angle: 0, speed: 0 };

trackImg.onload = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    scaleX = canvas.width / trackImg.width;
    scaleY = canvas.height / trackImg.height;
    offscreenCanvas.width = trackImg.width;
    offscreenCanvas.height = trackImg.height;
    offscreenCtx.drawImage(trackImg, 0, 0);
    // Find starting position on track near center
    let imageData = offscreenCtx.getImageData(0, 0, trackImg.width, trackImg.height);
    let startX = Math.floor(trackImg.width / 2);
    let startY = Math.floor(trackImg.height / 2);
    car.x = startX;
    car.y = startY;
    if (imageData.data[(startY * trackImg.width + startX) * 4 + 3] === 0) { // not on track
        for (let r = 1; r < Math.min(trackImg.width, trackImg.height) / 2; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (Math.abs(dx) === r || Math.abs(dy) === r) { // perimeter
                        let nx = startX + dx;
                        let ny = startY + dy;
                        if (nx >= 0 && nx < trackImg.width && ny >= 0 && ny < trackImg.height) {
                            if (imageData.data[(ny * trackImg.width + nx) * 4 + 3] > 0) {
                                car.x = nx;
                                car.y = ny;
                                r = 999; // break outer
                                break;
                            }
                        }
                    }
                }
                if (car.x !== startX) break;
            }
            if (car.x !== startX) break;
        }
    }
    draw();
};

trackImg.src = '/tracks/Albert_Park_Circuit_Melbourne_Track_Transparent.png';
carImg.src = '/cars/car.png';

trackImg.onerror = () => { console.log('Track image failed to load'); };
carImg.onerror = () => { console.log('Car image failed to load'); };
carImg.onload = () => { console.log('Car image loaded'); };

let keys = {};

document.addEventListener('keydown', (e) => { keys[e.code] = true; });
document.addEventListener('keyup', (e) => { keys[e.code] = false; });

function update() {
    if (keys['KeyW'] || keys['ArrowUp']) car.speed += 0.5;
    if (keys['KeyS'] || keys['ArrowDown']) car.speed -= 0.5;
    if (keys['KeyA'] || keys['ArrowLeft']) car.angle -= 0.05;
    if (keys['KeyD'] || keys['ArrowRight']) car.angle += 0.05;

    car.speed *= 0.95; // friction

    let newX = car.x + Math.cos(car.angle) * car.speed;
    let newY = car.y + Math.sin(car.angle) * car.speed;

    // Check if new position is on track (alpha > 0)
    let pixel = offscreenCtx.getImageData(Math.floor(newX), Math.floor(newY), 1, 1).data;
    if (pixel[3] > 0) { // alpha > 0
        car.x = newX;
        car.y = newY;
    } else {
        car.speed = 0; // stop if off track
    }

    // Clamp to canvas
    car.x = Math.max(0, Math.min(trackImg.width - 1, car.x));
    car.y = Math.max(0, Math.min(trackImg.height - 1, car.y));
}

function draw() {
    ctx.save();
    ctx.scale(scaleX, scaleY);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, trackImg.width, trackImg.height);
    ctx.drawImage(trackImg, 0, 0);
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    if (carImg.complete && carImg.naturalWidth > 0) {
        ctx.drawImage(carImg, - (carImg.width / 2) * 0.4, - (carImg.height / 2) * 0.4, carImg.width * 0.4, carImg.height * 0.4);
    } else {
        ctx.fillStyle = 'red';
        ctx.fillRect(-10, -5, 20, 10);
    }
    ctx.restore();
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

loop();
