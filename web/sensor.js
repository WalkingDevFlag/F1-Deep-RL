// Sensor class for ray casting obstacle detection

class Sensor {
    constructor(car) {
        this.car = car;
        this.rayCount = 11;  // Increased from 5 for better coverage
        this.rayLength = 350;  // Base length for center ray
        this.raySpread = Math.PI;  // 180 degrees
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
            
            if (px < 0 || py < 0 || px >= this.car.trackWidth || py >= this.car.trackHeight) {
                return {
                    x: px,
                    y: py,
                    offset: t
                };
            }
            
            // Use cached track data instead of expensive getImageData()
            const index = (py * this.car.trackWidth + px) * 4;
            if (this.car.trackData[index + 3] === 0) { // hit track boundary
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
            // Calculate angle spread relative to car's facing direction
            const rayOffset = lerp(
                this.raySpread / 2,
                -this.raySpread / 2,
                this.rayCount == 1 ? 0.5 : i / (this.rayCount - 1)
            );
            
            const rayAngle = this.car.angle + rayOffset;
            
            // Create parabolic length distribution - center rays longer than side rays
            const normalizedOffset = Math.abs(rayOffset) / (this.raySpread / 2); // 0 to 1
            const parabolicLength = this.rayLength * (1 - normalizedOffset * normalizedOffset * 0.6); // Parabolic curve
            
            const start = { x: this.car.x, y: this.car.y };
            const end = {
                x: this.car.x + Math.cos(rayAngle) * parabolicLength,
                y: this.car.y + Math.sin(rayAngle) * parabolicLength
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

    getNormalizedOffsets() {
        return this.readings.map(reading => reading ? 1 - reading.offset : 0);
    }
}
