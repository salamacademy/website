// ============================
// SALAM ACADEMY — MAIN JS
// ============================

// Custom cursor
const dot = document.getElementById('cursorDot');
const ring = document.getElementById('cursorRing');
let mouseX = 0, mouseY = 0, ringX = 0, ringY = 0;

if (window.innerWidth > 768) {
  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX; mouseY = e.clientY;
    dot.style.left = mouseX + 'px';
    dot.style.top = mouseY + 'px';
  });

  function animRing() {
    ringX += (mouseX - ringX) * 0.15;
    ringY += (mouseY - ringY) * 0.15;
    ring.style.left = ringX + 'px';
    ring.style.top = ringY + 'px';
    requestAnimationFrame(animRing);
  }
  animRing();

  document.querySelectorAll('a,button,.pkg-card,.sport-card').forEach(el => {
    el.addEventListener('mouseenter', () => {
      dot.style.transform = 'translate(-50%,-50%) scale(2)';
      ring.style.transform = 'translate(-50%,-50%) scale(1.5)';
      ring.style.opacity = '0.3';
    });
    el.addEventListener('mouseleave', () => {
      dot.style.transform = 'translate(-50%,-50%) scale(1)';
      ring.style.transform = 'translate(-50%,-50%) scale(1)';
      ring.style.opacity = '0.6';
    });
  });
}

// Navbar scroll
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 40);
});

// Mobile nav
function toggleMobileNav() {
  const nav = document.getElementById('mobileNav');
  const btn = document.getElementById('mobileBtn');
  nav.classList.toggle('open');
  btn.textContent = nav.classList.contains('open') ? '✕' : '☰';
}

function closeMobileNav() {
  document.getElementById('mobileNav').classList.remove('open');
  document.getElementById('mobileBtn').textContent = '☰';
}

// Close mobile nav on outside click
document.addEventListener('click', (e) => {
  const nav = document.getElementById('mobileNav');
  const btn = document.getElementById('mobileBtn');
  if (nav.classList.contains('open') && !nav.contains(e.target) && !btn.contains(e.target)) {
    closeMobileNav();
  }
});

// Counter animation
function animateCount(el, target, duration = 1800) {
  let start = 0;
  const step = (timestamp) => {
    if (!start) start = timestamp;
    const progress = Math.min((timestamp - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.floor(eased * target).toLocaleString('ar');
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Scroll reveal + count trigger
const revealEls = document.querySelectorAll('.reveal');
const countEls = document.querySelectorAll('[data-count]');
let countStarted = false;

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.12 });

revealEls.forEach(el => revealObserver.observe(el));

const statsObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting && !countStarted) {
      countStarted = true;
      countEls.forEach(el => {
        const target = parseInt(el.dataset.count);
        animateCount(el, target);
      });
    }
  });
}, { threshold: 0.5 });

const statsBar = document.querySelector('.hero-stats-bar');
if (statsBar) statsObserver.observe(statsBar);

function showToast(msg) {
  const t = document.createElement('div');
  t.style.cssText = `
    position:fixed;top:90px;left:50%;transform:translateX(-50%);
    background:linear-gradient(135deg,#8B3A12,#B8541E);color:white;
    padding:14px 28px;border-radius:40px;font-family:Tajawal,sans-serif;
    font-size:1rem;font-weight:700;z-index:9999;direction:rtl;
    box-shadow:0 8px 28px rgba(184,84,30,0.5);white-space:nowrap;
    animation:toastIn 0.4s ease;
  `;
  const style = document.createElement('style');
  style.textContent = `@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(-16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`;
  document.head.appendChild(style);
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transition='opacity 0.4s'; setTimeout(()=>t.remove(),400); }, 4000);
}

// PWA service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}
