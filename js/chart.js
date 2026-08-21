window.Chart = (function () {
  function draw(canvas, series) {
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    // تنظیم ابعاد واقعی کانواس برای کیفیت بالا
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const padding = 30;
    const w = rect.width - padding * 2;
    const h = rect.height - padding * 2;

    // یافتن محدوده مقادیر Y (زمان) و X (شماره حل)
    let minY = Infinity, maxY = -Infinity;
    let minX = Infinity, maxX = -Infinity;

    series.forEach(s => {
      s.points.forEach(p => {
        if (isFinite(p.y)) {
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
      });
    });

    // اگر داده‌ای وجود نداشت یا همه DNF بودند، مقادیر پیش‌فرض
    if (minY === Infinity) { minY = 0; maxY = 10000; }
    if (minX === Infinity) { minX = 1; maxX = 10; }

    const rangeY = maxY - minY || 10000;
    minY = Math.max(0, minY - rangeY * 0.1); // 10% فضای خالی در پایین
    maxY = maxY + rangeY * 0.1;              // 10% فضای خالی در بالا
    
    const rangeX = maxX - minX || 1;

    // توابع تبدیل مختصات داده به مختصات کانواس
    const getX = x => padding + ((x - minX) / rangeX) * w;
    const getY = y => padding + h - ((y - minY) / (maxY - minY)) * h;

    // خواندن رنگ‌ها از متغیرهای CSS برای سازگاری با تم تاریک/روشن
    const borderColor = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#333';

    // رسم خطوط شبکه (Grid)
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const y = padding + (h / 4) * i;
      ctx.moveTo(padding, y);
      ctx.lineTo(padding + w, y);
    }
    ctx.stroke();

    // رسم خطوط و نقاط هر سری داده
    series.forEach(s => {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      
      let started = false;
      s.points.forEach(p => {
        if (!isFinite(p.y)) return; // رد کردن DNFها در رسم خط
        const x = getX(p.x);
        const y = getY(p.y);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      // رسم نقاط داده
      ctx.fillStyle = s.color;
      s.points.forEach(p => {
        if (!isFinite(p.y)) return;
        ctx.beginPath();
        ctx.arc(getX(p.x), getY(p.y), 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
    });
  }

  return { draw };
})();
