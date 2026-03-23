(function (global) {
  'use strict';

  function initTimelineFireworks(options) {
    var settings = options || {};
    var prefersReducedMotion =
      global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      return;
    }

    var canvasId = settings.canvasId || 'timelineFireworks';
    var canvas = document.getElementById(canvasId);
    if (!canvas) {
      return;
    }

    var ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    var palette = settings.palette || [
      '#ffd166',
      '#ff6b6b',
      '#7bdff2',
      '#a0e426',
      '#ff9f1c',
      '#c77dff'
    ];

    var beatMs = settings.beatMs || 720;
    var maxParticles = settings.maxParticles || 360;
    var gravity = settings.gravity || 0.028;
    var phases = settings.phases || [];
    var activePhaseIndex = 0;
    var particles = [];
    var rafId = null;
    var lastTs = 0;
    var beatTimer = 0;
    var beatCount = 0;

    var patterns = [
      { count: 16, speed: 2.0, drift: 0.05, life: 74, size: 2.0 },
      { count: 22, speed: 2.3, drift: 0.06, life: 80, size: 1.8 },
      { count: 28, speed: 2.7, drift: 0.07, life: 84, size: 1.7 }
    ];

    function clamp(v, min, max) {
      return Math.max(min, Math.min(max, v));
    }

    function resizeCanvas() {
      var dpr = Math.min(global.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(global.innerWidth * dpr);
      canvas.height = Math.floor(global.innerHeight * dpr);
      canvas.style.width = global.innerWidth + 'px';
      canvas.style.height = global.innerHeight + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function createBurst(anchorX, anchorY, phaseIndex, beatIndex) {
      var pattern = patterns[(phaseIndex + beatIndex) % patterns.length];
      var baseRotation = (phaseIndex * 0.37 + beatIndex * 0.22) % (Math.PI * 2);

      for (var i = 0; i < pattern.count; i++) {
        var unit = i / pattern.count;
        var angle = unit * Math.PI * 2 + baseRotation;
        var speedShift = ((i % 5) - 2) * 0.08;
        var speed = pattern.speed + speedShift;

        particles.push({
          x: anchorX,
          y: anchorY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.9,
          life: pattern.life + (i % 4) * 6,
          age: 0,
          size: pattern.size + (i % 3) * 0.35,
          color: palette[(i + phaseIndex + beatIndex) % palette.length],
          alpha: 0.95,
          drift: pattern.drift
        });
      }

      if (particles.length > maxParticles) {
        particles.splice(0, particles.length - maxParticles);
      }
    }

    function resolveScatterAnchor(phaseIndex) {
      var width = global.innerWidth;
      var height = global.innerHeight;
      var sidePadding = Math.max(60, width * 0.05);

      var x = sidePadding + Math.random() * Math.max(40, width - sidePadding * 2);

      var timelineRatio = phases.length > 1 ? phaseIndex / (phases.length - 1) : 0.35;
      var bandCenter = 0.2 + timelineRatio * 0.42;
      var bandHalf = 0.24;
      var bandMin = clamp((bandCenter - bandHalf) * height, 70, height - 180);
      var bandMax = clamp((bandCenter + bandHalf) * height, 120, height - 100);
      var bandY = bandMin + Math.random() * Math.max(20, bandMax - bandMin);

      var freeY = 70 + Math.random() * Math.max(120, height * 0.72);
      var y = Math.random() < 0.72 ? bandY : freeY;

      return {
        x: clamp(x, 50, width - 50),
        y: clamp(y, 70, height - 80)
      };
    }

    function drawAndUpdate() {
      ctx.clearRect(0, 0, global.innerWidth, global.innerHeight);

      for (var i = particles.length - 1; i >= 0; i--) {
        var p = particles[i];
        p.age += 1;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += gravity;
        p.vx *= 0.992;
        p.x += Math.sin((p.age + i) * 0.06) * p.drift;

        var lifeRatio = 1 - p.age / p.life;
        if (lifeRatio <= 0) {
          particles.splice(i, 1);
          continue;
        }

        p.alpha = lifeRatio;

        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
    }

    function animate(ts) {
      if (!lastTs) {
        lastTs = ts;
      }

      var dt = ts - lastTs;
      lastTs = ts;
      beatTimer += dt;

      while (beatTimer >= beatMs) {
        beatTimer -= beatMs;
        beatCount += 1;

        var burstCount = 2 + ((beatCount + activePhaseIndex) % 3 === 0 ? 1 : 0);
        for (var b = 0; b < burstCount; b++) {
          var anchor = resolveScatterAnchor(activePhaseIndex);
          createBurst(anchor.x, anchor.y, activePhaseIndex, beatCount + b);
        }
      }

      drawAndUpdate();
      rafId = global.requestAnimationFrame(animate);
    }

    function setupPhaseTracking() {
      if (!phases.length) {
        return;
      }

      if (!('IntersectionObserver' in global)) {
        return;
      }

      var observed = [];
      phases.forEach(function (phase, index) {
        if (phase && phase.watchSelector) {
          var target = document.querySelector(phase.watchSelector);
          if (target) {
            observed.push({ target: target, index: index });
          }
        }
      });

      if (!observed.length) {
        return;
      }

      var io = new IntersectionObserver(function (entries) {
        var best = null;
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) {
            return;
          }
          if (!best || entry.intersectionRatio > best.intersectionRatio) {
            best = entry;
          }
        });

        if (!best) {
          return;
        }

        for (var i = 0; i < observed.length; i++) {
          if (observed[i].target === best.target) {
            activePhaseIndex = observed[i].index;
            break;
          }
        }
      }, {
        root: null,
        threshold: [0.15, 0.3, 0.5, 0.75],
        rootMargin: '-8% 0px -30% 0px'
      });

      observed.forEach(function (item) {
        io.observe(item.target);
      });
    }

    function start() {
      resizeCanvas();
      setupPhaseTracking();
      rafId = global.requestAnimationFrame(animate);
    }

    function stop() {
      if (rafId) {
        global.cancelAnimationFrame(rafId);
        rafId = null;
      }
      ctx.clearRect(0, 0, global.innerWidth, global.innerHeight);
    }

    global.addEventListener('resize', resizeCanvas);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        stop();
      } else {
        lastTs = 0;
        beatTimer = 0;
        start();
      }
    });

    start();
  }

  global.initTimelineFireworks = initTimelineFireworks;
})(window);
