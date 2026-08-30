// Tiny dependency-free canvas line chart for Ao5 progression
(function () {
  window.Chart = {
    draw(canvas, seriesList) {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth || 600;
      const h = canvas.clientHeight || 220;
      canvas.width = w * dpr; canvas.height = h * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      const pts = seriesList.flatMap(s => s.points).filter(p => p.y != null && isFinite(p.y));
      if (!pts.length) {
        ctx.fillStyle = '#5c7089';
        ctx.font = '13px "IBM Plex Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No Ao5 data yet — at least 5 solves needed', w / 2, h / 2);
        return;
      }
      const padL = 48, padR = 14, padT = 14, padB = 24;
      const xs = pts.map(p => p.x);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      let minY = Math.min(...pts.map(p => p.y)), maxY = Math.max(...pts.map(p => p.y));
      if (minY === maxY) { minY -= 1000; maxY += 1000; }
      const X = x => maxX === minX ? padL + (w - padL - padR) / 2
        : padL + (x - minX) / (maxX - minX) * (w - padL - padR);
      const Y = y => padT + (1 - (y - minY) / (maxY - minY)) * (h - padT - padB);

      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      for (let i = 0; i <= 4; i++) {
        const y = padT + i / 4 * (h - padT - padB);
        const val = maxY - i / 4 * (maxY - minY);
        ctx.strokeStyle = 'rgba(39,57,82,.5)';
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
        ctx.fillStyle = '#5c7089';
        ctx.fillText((val / 1000).toFixed(1) + 's', padL - 6, y + 3);
      }
      ctx.textAlign = 'left';
      ctx.fillText('#' + minX, padL, h - 8);
      ctx.textAlign = 'right';
      ctx.fillText('#' + maxX, w - padR, h - 8);

      for (const s of seriesList) {
        ctx.strokeStyle = s.color; ctx.lineWidth = 2;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath();
        let pen = false, last = null;
        for (const p of s.points) {
          if (p.y == null || !isFinite(p.y)) { pen = false; continue; }
          const x = X(p.x), y = Y(p.y);
          if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
          last = { x, y };
        }
        ctx.stroke();
        if (last) {
          ctx.fillStyle = s.color;
          ctx.beginPath(); ctx.arc(last.x, last.y, 3, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  };
})();
