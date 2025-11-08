// Sensor class for ray casting obstacle detection

class Sensor {
    constructor(car) {
        this.car = car;
        this.rayCount = 5;
        this.rayLength = 250;  // Increased from 150 for longer visible rays
        this.raySpread = Math.PI / 2;
        this.rays = [];
        this.readings = [];
    }

    update() {
        this.castRays();
        this.readings = [];
        for (let i = 0; i < this.rays.length; i++) {
            this.readings.push(this.getRayReading(this.rays[i]));
        }
    }

    getRayReading(ray) {
        const start = ray[0];
        const end = ray[1];
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.hypot(dx, dy);
        const steps = Math.ceil(length);
        
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const px = Math.floor(start.x + dx * t);
            const py = Math.floor(start.y + dy * t);
            
            if (px < 0 || py < 0 || px >= this.car.trackImg.width || py >= this.car.trackImg.height) {
                return {
                    x: px,
                    y: py,
                    offset: t
                };
            }
            
            const pixel = this.car.offscreenCtx.getImageData(px, py, 1, 1).data;
            if (pixel[3] === 0) { // hit track boundary
                return {
                    x: px,
                    y: py,
                    offset: t
                };
            }
        }
        return null;
    }

    castRays() {
        this.rays = [];
        for (let i = 0; i < this.rayCount; i++) {
            const rayAngle = lerp(
                this.raySpread / 2,
                -this.raySpread / 2,
                this.rayCount == 1 ? 0.5 : i / (this.rayCount - 1)
            ) + this.car.angle;

            const start = { x: this.car.x, y: this.car.y };
            const end = {
                x: this.car.x + Math.sin(rayAngle) * this.rayLength,
                y: this.car.y - Math.cos(rayAngle) * this.rayLength
            };
            this.rays.push([start, end]);
        }
    }

    draw(ctx) {
        for (let i = 0; i < this.rayCount; i++) {
            let end = this.rays[i][1];
            if (this.readings[i]) {
                end = this.readings[i];
            }

            // Yellow ray from car center to collision point (active detection)
            ctx.beginPath();
            ctx.lineWidth = 3;
            ctx.strokeStyle = "yellow";
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.moveTo(
                this.rays[i][0].x,
                this.rays[i][0].y
            );
            ctx.lineTo(
                end.x,
                end.y
            );
            ctx.stroke();

            // Black ray from collision point to full ray length (no detection zone)
            ctx.beginPath();
            ctx.lineWidth = 2;
            ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
            ctx.setLineDash([5, 5]);  // Dashed line for visual distinction
            ctx.moveTo(
                end.x,
                end.y
            );
            ctx.lineTo(
                this.rays[i][1].x,
                this.rays[i][1].y
            );
            ctx.stroke();
            ctx.setLineDash([]);  // Reset line dash

            // Draw sensor endpoints as small circles for better visibility
            if (this.readings[i]) {
                // Red circle at collision point
                ctx.beginPath();
                ctx.arc(end.x, end.y, 4, 0, Math.PI * 2);
                ctx.fillStyle = "red";
                ctx.fill();
                ctx.strokeStyle = "darkred";
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        }
    }
}
