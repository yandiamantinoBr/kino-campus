async (page) => {
  return page.evaluate(async () => {
    document.getElementById('kc-spinner-probe')?.remove();

    const host = document.createElement('div');
    host.id = 'kc-spinner-probe';
    host.style.cssText = [
      'position:fixed',
      'z-index:999999',
      'top:40px',
      'left:40px',
      'font-size:64px',
      'color:#ff6b00',
      'background:#111',
      'padding:30px'
    ].join(';');
    host.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>';
    document.body.appendChild(host);

    const spinner = host.querySelector('i');
    const read = () => {
      const style = getComputedStyle(spinner);
      return {
        animationName: style.animationName,
        animationDuration: style.animationDuration,
        transform: style.transform,
        opacity: style.opacity,
        display: style.display,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches
      };
    };

    const first = read();
    await new Promise((resolve) => setTimeout(resolve, 260));
    const second = read();
    await new Promise((resolve) => setTimeout(resolve, 260));
    const third = read();

    return { first, second, third };
  });
}
