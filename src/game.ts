import Matter from 'matter-js';

type EngineEvent = Matter.IEventCollision<Matter.Engine>;
type CollisionPair = Matter.Pair;

const BALL_TEXTURE = new URL('./assets/soccer_ball_classic.svg', import.meta.url).href;

type Point = { x: number; y: number };

export class MiniShootout {
  private readonly canvas: HTMLCanvasElement;
  private readonly onScoreChange: (score: number) => void;

  private engine: Matter.Engine;
  private runner: Matter.Runner;
  private render: Matter.Render;

  private ball: Matter.Body;
  private goalSensor: Matter.Body;
  private goalParts: Matter.Body[] = [];
  private bounds: Matter.Body[] = [];

  private ballStart: Point;
  private pointerStart: Point | null = null;

  private score = 0;
  private scored = false;
  private readonly baseBallRadius = 56;
  private readonly baseSpriteSize = 194;
  private readonly baseSpriteScale = (this.baseBallRadius * 2) / this.baseSpriteSize;
  private currentRadius = this.baseBallRadius;
  private currentSpriteScale = this.baseSpriteScale;
  private goalWidth = 0;
  private goalThickness = 18;
  private hadUpwardMotion = false;
  private viewportWidth = window.innerWidth;
  private viewportHeight = window.innerHeight;
  private pixelRatio = window.devicePixelRatio || 1;

  private readonly handleResizeBound = this.handleResize.bind(this);
  private readonly handlePointerDownBound = this.handlePointerDown.bind(this);
  private readonly handlePointerUpBound = this.handlePointerUp.bind(this);

  constructor(canvas: HTMLCanvasElement, onScoreChange: (score: number) => void) {
    this.canvas = canvas;
    this.onScoreChange = onScoreChange;

    this.updateViewportMetrics();
    this.engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });
    this.runner = Matter.Runner.create();
    this.render = Matter.Render.create({
      canvas: this.canvas,
      engine: this.engine,
      options: {
        width: this.viewportWidth,
        height: this.viewportHeight,
        background: 'transparent',
        wireframes: false,
        pixelRatio: this.pixelRatio
      }
    });
    this.applyCanvasMetrics();

    this.ballStart = { x: this.viewportWidth / 2, y: this.viewportHeight - this.baseBallRadius - 90 };
    this.ball = Matter.Bodies.circle(this.ballStart.x, this.ballStart.y, this.baseBallRadius, {
      label: 'ball',
      restitution: 0.45,
      frictionAir: 0.025,
      friction: 0.01,
      frictionStatic: 0.01,
      render: {
        sprite: {
          texture: BALL_TEXTURE,
          xScale: this.baseSpriteScale,
          yScale: this.baseSpriteScale
        }
      }
    });
    Matter.Body.setStatic(this.ball, true);

    const { goalBodies, sensor } = this.createGoal();
    this.goalParts = goalBodies;
    this.goalSensor = sensor;

    this.bounds = this.createBounds();

    Matter.World.add(this.engine.world, [this.ball, ...this.goalParts, this.goalSensor, ...this.bounds]);

    this.attachEventListeners();
    this.configureCollisions();

    Matter.Render.run(this.render);
    Matter.Runner.run(this.runner, this.engine);
  }

  private updateViewportMetrics() {
    const viewport = window.visualViewport;
    const fallbackWidth = document.documentElement.clientWidth || window.innerWidth;
    const fallbackHeight = document.documentElement.clientHeight || window.innerHeight;

    this.viewportWidth = viewport?.width ?? fallbackWidth;
    this.viewportHeight = viewport?.height ?? fallbackHeight;
    this.pixelRatio = window.devicePixelRatio || 1;
  }

  private applyCanvasMetrics() {
    const cssWidth = this.viewportWidth;
    const cssHeight = this.viewportHeight;
    const dpr = this.pixelRatio;

    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(cssHeight * dpr));

    if (this.render) {
      Matter.Render.setPixelRatio(this.render, dpr);
      this.render.options.width = cssWidth;
      this.render.options.height = cssHeight;
    }
  }

  private attachEventListeners() {
    window.addEventListener('resize', this.handleResizeBound);
    window.visualViewport?.addEventListener('resize', this.handleResizeBound);

    this.canvas.addEventListener('pointerdown', this.handlePointerDownBound);
    this.canvas.addEventListener('pointerup', this.handlePointerUpBound);
    this.canvas.addEventListener('pointercancel', this.handlePointerUpBound);
    this.canvas.addEventListener('pointerleave', this.handlePointerUpBound);
  }

  private handleResize() {
    this.updateViewportMetrics();
    this.applyCanvasMetrics();

    this.ballStart = { x: this.viewportWidth / 2, y: this.viewportHeight - this.baseBallRadius - 90 };
    this.rebuildStaticBodies();

    if (this.ball.isStatic) {
      this.resetBall(false);
    }
  }

  private rebuildStaticBodies() {
    const world = this.engine.world;

    this.goalParts.forEach((body) => Matter.World.remove(world, body));
    Matter.World.remove(world, this.goalSensor);
    this.bounds.forEach((body) => Matter.World.remove(world, body));

    const { goalBodies, sensor } = this.createGoal();
    this.goalParts = goalBodies;
    this.goalSensor = sensor;
    this.bounds = this.createBounds();

    Matter.World.add(world, [...this.goalParts, this.goalSensor, ...this.bounds]);
  }

  private handlePointerDown(event: PointerEvent) {
    if (!event.isPrimary || !this.ball.isStatic) return;
    this.pointerStart = { x: event.clientX, y: event.clientY };
  }

  private handlePointerUp(event: PointerEvent) {
    if (!this.pointerStart || !event.isPrimary) return;

    const end: Point = { x: event.clientX, y: event.clientY };
    const delta: Point = {
      x: end.x - this.pointerStart.x,
      y: end.y - this.pointerStart.y
    };

    const distance = Math.hypot(delta.x, delta.y);
    const upwardTravel = this.pointerStart.y - end.y;

    this.pointerStart = null;

    if (distance < 30 || upwardTravel < 20) {
      return;
    }

    this.shootBall(delta);
  }

  private shootBall(delta: Point) {
    if (!this.ball.isStatic) return;

    this.scored = false;
    this.resetBallScale();
    Matter.Body.setStatic(this.ball, false);
    Matter.Body.setPosition(this.ball, this.ballStart);
    this.hadUpwardMotion = false;

    const speedScale = 0.3;
    const maxSpeed = 32;

    let vx = delta.x * speedScale;
    let vy = delta.y * speedScale;

    const magnitude = Math.hypot(vx, vy);
    if (magnitude > maxSpeed) {
      const limit = maxSpeed / magnitude;
      vx *= limit;
      vy *= limit;
    }

    Matter.Body.setVelocity(this.ball, { x: vx, y: vy });
    Matter.Body.setAngularVelocity(this.ball, 0);
    if (vy < -4) {
      this.hadUpwardMotion = true;
    }
  }

  private configureCollisions() {
    Matter.Events.on(this.engine, 'collisionStart', (event: EngineEvent) => {
      event.pairs.forEach((pair: CollisionPair) => {
        const { bodyA, bodyB } = pair;
        const labels = [bodyA.label, bodyB.label];

        if (labels.includes('ball') && labels.includes('goal-sensor')) {
          this.handleGoal();
        }
      });
    });

    Matter.Events.on(this.engine, 'afterUpdate', () => {
      if (!this.ball.isStatic && this.ball.velocity.y < -4) {
        this.hadUpwardMotion = true;
      }
      this.applyPerspectiveScale();

      if (this.ball.isStatic) return;

      const { x, y } = this.ball.position;
      const outOfBounds =
        x < -200 ||
        x > this.viewportWidth + 200 ||
        y > this.viewportHeight + 200 ||
        y < -200;

      const speed = Math.hypot(this.ball.velocity.x, this.ball.velocity.y);

      if (outOfBounds || speed < 2) {
        const missed = !this.scored;
        this.resetBall(missed);
      }
    });
  }

  private handleGoal() {
    if (this.scored) return;

    const goalCenterX = this.viewportWidth / 2;
    const innerLeft = goalCenterX - (this.goalWidth / 2 - this.goalThickness);
    const innerRight = goalCenterX + (this.goalWidth / 2 - this.goalThickness);
    const withinPosts =
      this.ball.position.x > innerLeft + this.currentRadius * 0.6 &&
      this.ball.position.x < innerRight - this.currentRadius * 0.6;
    const movingTowardGoal = this.ball.velocity.y < -2 || this.hadUpwardMotion;

    if (!withinPosts || !movingTowardGoal) {
      return;
    }

    this.scored = true;
    this.score += 1;
    this.onScoreChange(this.score);

    setTimeout(() => {
      this.resetBall(false);
    }, 600);
  }

  private resetBall(missed: boolean) {
    Matter.Body.setStatic(this.ball, true);
    this.resetBallScale();
    Matter.Body.setPosition(this.ball, this.ballStart);
    Matter.Body.setVelocity(this.ball, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(this.ball, 0);
    if (missed) {
      if (this.score !== 0) {
        this.score = 0;
      }
      this.onScoreChange(this.score);
    }
    this.scored = false;
    this.hadUpwardMotion = false;
  }

  private resetBallScale() {
    const factor = this.baseBallRadius / this.currentRadius;
    if (Math.abs(factor - 1) > 0.001) {
      Matter.Body.scale(this.ball, factor, factor);
    }
    this.currentRadius = this.baseBallRadius;
    this.currentSpriteScale = this.baseSpriteScale;
    if (this.ball.render.sprite) {
      this.ball.render.sprite.xScale = this.currentSpriteScale;
      this.ball.render.sprite.yScale = this.currentSpriteScale;
    }
  }

  private applyPerspectiveScale() {
    const height = this.viewportHeight;
    if (height <= 0) return;

    const clampedY = Math.min(Math.max(this.ball.position.y, 0), height);
    const bottomY = this.ballStart.y;
    const topY = Math.max(60, height * 0.18);
    const range = Math.max(bottomY - topY, 1);
    const normalized = Math.min(Math.max((clampedY - topY) / range, 0), 1);

    const minScale = 0.78;
    const maxScale = 1;
    const eased = Math.pow(normalized, 0.65);
    const scale = minScale + (maxScale - minScale) * eased;
    const targetRadius = this.baseBallRadius * scale;

    if (Math.abs(targetRadius - this.currentRadius) < 0.2) {
      return;
    }

    const factor = targetRadius / this.currentRadius;
    Matter.Body.scale(this.ball, factor, factor);
    this.currentRadius = targetRadius;
    this.currentSpriteScale *= factor;
    if (this.ball.render.sprite) {
      this.ball.render.sprite.xScale = this.currentSpriteScale;
      this.ball.render.sprite.yScale = this.currentSpriteScale;
    }
  }

  private createGoal() {
    const goalY = this.viewportHeight / 3;
    const width = Math.max(180, Math.min(240, this.viewportWidth * 0.55));
    const height = 108;
    const thickness = Math.max(18, Math.floor(width * 0.08));
    const goalX = this.viewportWidth / 2;

    this.goalWidth = width;
    this.goalThickness = thickness;

    const postOptions: Matter.IBodyDefinition = {
      label: 'goal-post',
      isStatic: true,
      restitution: 0.9,
      friction: 0,
      render: {
        fillStyle: '#ffffff',
        lineWidth: 0
      }
    };

    const leftPost = Matter.Bodies.rectangle(goalX - width / 2, goalY, thickness, height, postOptions);
    const rightPost = Matter.Bodies.rectangle(goalX + width / 2, goalY, thickness, height, postOptions);
    const crossbar = Matter.Bodies.rectangle(goalX, goalY - height / 2, width + thickness, thickness, postOptions);

    const sensorWidth = Math.max(90, width - thickness * 2 - this.baseBallRadius * 0.6);
    const sensorHeight = Math.max(60, height - thickness * 1.5);
    const sensor = Matter.Bodies.rectangle(goalX, goalY, sensorWidth, sensorHeight, {
      label: 'goal-sensor',
      isStatic: true,
      isSensor: true,
      render: { visible: false }
    });

    return { goalBodies: [leftPost, rightPost, crossbar], sensor };
  }

  private createBounds() {
    const offset = 100;
    const wallThickness = 100;
    const width = this.viewportWidth;
    const height = this.viewportHeight;

    const wallOptions: Matter.IBodyDefinition = {
      isStatic: true,
      restitution: 0.6,
      friction: 0,
      render: { visible: false }
    };

    const left = Matter.Bodies.rectangle(-offset, height / 2, wallThickness, height * 2, {
      ...wallOptions,
      label: 'bounds'
    });
    const right = Matter.Bodies.rectangle(width + offset, height / 2, wallThickness, height * 2, {
      ...wallOptions,
      label: 'bounds'
    });
    const top = Matter.Bodies.rectangle(width / 2, -offset, width * 2, wallThickness, {
      ...wallOptions,
      label: 'bounds'
    });
    const bottom = Matter.Bodies.rectangle(width / 2, height + offset, width * 2, wallThickness, {
      ...wallOptions,
      label: 'bounds'
    });

    return [left, right, top, bottom];
  }


  public destroy() {
    window.removeEventListener('resize', this.handleResizeBound);
    window.visualViewport?.removeEventListener('resize', this.handleResizeBound);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDownBound);
    this.canvas.removeEventListener('pointerup', this.handlePointerUpBound);
    this.canvas.removeEventListener('pointercancel', this.handlePointerUpBound);
    this.canvas.removeEventListener('pointerleave', this.handlePointerUpBound);

    Matter.Render.stop(this.render);
    Matter.Runner.stop(this.runner);
    Matter.Engine.clear(this.engine);
  }
}
