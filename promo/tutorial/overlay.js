/* ZionDesk tutorial overlay: injected into the real app while recording.
 * Cursor with click ripple, highlight ring, smooth zoom, chapter badge, lower-thirds and full-screen brand cards.
 * Everything lives in #tut (pointer-events: none), above the app. Driven by record.mjs through window.T. */
(() => {
  if (window.T) return
  const css = `
  #tut{position:fixed;inset:0;z-index:2147483000;pointer-events:none;font-family:'Inter Tight','Inter',system-ui,sans-serif}
  #tut *{box-sizing:border-box}
  .zt-cursor{position:absolute;left:0;top:0;width:34px;height:34px;transform:translate(960px,620px);transition:transform 900ms cubic-bezier(.45,.05,.2,1);filter:drop-shadow(0 6px 10px rgba(20,10,60,.28));z-index:9}
  .zt-cursor svg{width:34px;height:34px}
  .zt-ripple{position:absolute;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;border:3px solid #6c34ff;opacity:.9;animation:t-rip 650ms ease-out forwards;z-index:8}
  @keyframes t-rip{to{transform:scale(4.2);opacity:0}}
  .zt-ring{position:absolute;border-radius:18px;border:3px solid #6c34ff;box-shadow:0 0 0 6px rgba(108,52,255,.18),0 0 0 4000px rgba(17,16,21,.16);opacity:0;transition:all 650ms cubic-bezier(.45,.05,.2,1);z-index:5}
  .zt-ring.on{opacity:1}
  .zt-chap{position:absolute;left:36px;bottom:34px;display:flex;align-items:center;gap:12px;padding:10px 18px 10px 10px;border-radius:999px;background:rgba(17,16,21,.86);color:#fff;font-size:20px;font-weight:600;letter-spacing:-.01em;backdrop-filter:blur(8px);opacity:0;transform:translateY(16px);transition:all 600ms cubic-bezier(.2,.8,.2,1);z-index:6}
  .zt-chap.on{opacity:1;transform:none}
  .zt-chap b{display:grid;place-items:center;min-width:38px;height:38px;padding:0 10px;border-radius:999px;background:#c4ec62;color:#18210a;font-size:18px}
  .zt-lower{position:absolute;right:40px;bottom:40px;max-width:640px;padding:22px 28px;border-radius:26px;background:#fff;color:#111015;box-shadow:0 30px 70px -20px rgba(30,10,80,.45);opacity:0;transform:translateY(24px) scale(.98);transition:all 650ms cubic-bezier(.2,.8,.2,1);z-index:7;border:1px solid rgba(108,52,255,.15)}
  .zt-lower.on{opacity:1;transform:none}
  .zt-lower small{display:inline-block;margin-bottom:8px;padding:5px 12px;border-radius:999px;background:#6c34ff;color:#fff;font-size:15px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
  .zt-lower h4{margin:0;font-size:38px;line-height:1.05;letter-spacing:-.03em;font-weight:800}
  .zt-lower p{margin:10px 0 0;font-size:21px;line-height:1.4;color:#4b4858}
  .zt-card{position:absolute;inset:0;display:grid;place-items:center;background:#f4f1ea;opacity:0;transition:opacity 700ms ease;z-index:10;overflow:hidden}
  .zt-card.on{opacity:1}
  .zt-card.dark{background:radial-gradient(1200px 700px at 30% 20%,#2a1c5c 0%,#14101f 55%,#0c0a12 100%);color:#fff}
  .zt-card.purple{background:radial-gradient(1100px 800px at 70% 10%,#8a5cff 0%,#6c34ff 45%,#4a1fd1 100%);color:#fff}
  .zt-in{opacity:0;transform:translateY(28px);transition:opacity 900ms ease, transform 900ms cubic-bezier(.2,.8,.2,1)}
  .zt-in.on{opacity:1;transform:none}
  .zt-big{font-family:'Ciscela',Georgia,serif;font-size:118px;line-height:1.02;letter-spacing:-.02em;text-align:center;margin:0}
  .zt-mid{font-family:'Ciscela',Georgia,serif;font-size:84px;line-height:1.05;letter-spacing:-.015em;text-align:center;margin:0}
  .zt-sub{font-size:32px;line-height:1.4;text-align:center;opacity:.78;margin:26px auto 0;max-width:1200px;font-weight:500}
  .zt-lime{color:#c4ec62}
  .zt-purple{color:#6c34ff}
  .zt-pains{display:grid;grid-template-columns:repeat(2,700px);gap:30px}
  .zt-pain{display:flex;gap:22px;align-items:center;padding:30px 34px;border-radius:30px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);font-size:36px;line-height:1.3;font-weight:600;text-align:left}
  .zt-pain i{font-style:normal;font-size:52px;line-height:1}
  .zt-pills{display:flex;gap:16px;justify-content:center;margin-top:44px}
  .zt-pill{padding:16px 30px;border-radius:999px;background:#fff;color:#111015;font-size:28px;font-weight:700;box-shadow:0 18px 40px -18px rgba(30,10,80,.5)}
  .zt-pill.l{background:#c4ec62;color:#18210a}
  .zt-tiles{display:grid;grid-template-columns:repeat(3,420px);gap:30px;margin-top:56px}
  .zt-tile{padding:40px 36px;border-radius:34px;background:#fff;color:#111015;text-align:left;box-shadow:0 30px 60px -30px rgba(30,10,80,.45)}
  .zt-tile i{font-style:normal;font-size:56px}
  .zt-tile h5{margin:18px 0 8px;font-size:34px;letter-spacing:-.02em;font-weight:800}
  .zt-tile p{margin:0;font-size:22px;color:#4b4858;line-height:1.4}
  .zt-logo{height:140px;margin:0 auto 36px;display:block}
  .zt-chapnum{display:inline-grid;place-items:center;width:112px;height:112px;border-radius:50%;background:#c4ec62;color:#18210a;font-size:50px;font-weight:800;margin-bottom:34px}
  .zt-list{display:grid;grid-template-columns:repeat(3,auto);gap:14px 18px;justify-content:center;margin-top:46px}
  .zt-list span{padding:12px 22px;border-radius:999px;background:rgba(255,255,255,.14);font-size:24px;font-weight:600}
  .zt-glow{position:absolute;width:900px;height:900px;border-radius:50%;background:radial-gradient(circle,rgba(196,236,98,.22),transparent 65%);animation:t-float 9s ease-in-out infinite alternate}
  @keyframes t-float{from{transform:translate(-30%,-20%)}to{transform:translate(20%,10%)}}
  #tut .zt-card>*,#tut .zt-lower,#tut .zt-chap{zoom:.75}
  #root{transition:transform 1100ms cubic-bezier(.45,.05,.2,1);transform-origin:0 0}
  `
  const mount = () => {
    if (document.getElementById('tut')) return
    const st = document.createElement('style')
    st.textContent = css
    document.head.appendChild(st)
    const t = document.createElement('div')
    t.id = 'tut'
    t.innerHTML = `<div class="zt-ring"></div><div class="zt-chap"><b></b><span></span></div><div class="zt-lower"><small></small><h4></h4><p></p></div><div class="zt-card"></div>
    <div class="zt-cursor"><svg viewBox="0 0 32 32"><path d="M6 3l19 12.4-8.3 1.6 4.9 9.3-3.6 1.9-4.9-9.4L6 25z" fill="#111015" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg></div>`
    document.body.appendChild(t)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount)
  else mount()

  const $ = (s) => document.querySelector('#tut ' + s)
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  let pos = { x: 960, y: 620 }
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0 && r.top < innerHeight
  }
  /** Find a visible element by its text (exact first, then starts-with, then contains). */
  const q = (text, sel = 'button,a,[role=tab],[role=radio],label,h1,h2,h3,summary,option,li,td,b,span,small,p,div', root = document) => {
    if (text instanceof Element) return text
    if (text.startsWith('css:')) return [...root.querySelectorAll(text.slice(4))].find(visible) ?? root.querySelector(text.slice(4))
    const all = [...root.querySelectorAll(sel)].filter((e) => !e.closest('#tut'))
    const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase()
    const want = norm(text)
    const own = (e) => norm(e.innerText ?? '')
    const act = (e) => (e.matches('button,a,[role=tab],[role=radio],summary,input,select,textarea') ? 0 : e.matches('label,h1,h2,h3') ? 1 : 2)
    const pick = (f) => all.filter((e) => f(own(e)) && visible(e)).sort((a, b) => own(a).length - own(b).length || act(a) - act(b))[0]
    return pick((s) => s === want) ?? pick((s) => s.startsWith(want)) ?? pick((s) => s.includes(want)) ?? null
  }
  const center = (el) => {
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r }
  }
  const T = {
    q,
    sleep,
    async move(target, ms = 900, dx = 0, dy = 0) {
      let p
      if (Array.isArray(target)) p = { x: target[0], y: target[1] }
      else {
        const el = q(target)
        if (!el) return console.warn('[tut] not found', target)
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        await sleep(30)
        const c = center(el)
        p = { x: Math.min(c.x + dx, c.r.left + 40 + dx), y: c.y + dy }
        if (c.r.width < 160) p.x = c.x + dx
      }
      const cur = $('.zt-cursor')
      cur.style.transitionDuration = ms + 'ms'
      cur.style.transform = `translate(${p.x - 6}px,${p.y - 3}px)`
      pos = p
      await sleep(ms)
      return true
    },
    async click(target, ms = 800) {
      const el = typeof target === 'string' ? q(target) : target
      if (!el) return console.warn('[tut] click: not found', target)
      await T.move(el, ms)
      const rp = document.createElement('div')
      rp.className = 'zt-ripple'
      rp.style.left = pos.x + 'px'
      rp.style.top = pos.y + 'px'
      document.getElementById('tut').appendChild(rp)
      setTimeout(() => rp.remove(), 700)
      await sleep(120)
      el.click()
      await sleep(250)
      return true
    },
    /** Types into an input/textarea like a person (React-safe). */
    async type(target, text, cps = 16) {
      const el = typeof target === 'string' ? q(target, 'input,textarea') ?? q(target) : target
      const input = el && (el.matches('input,textarea') ? el : el.querySelector('input,textarea') ?? el.closest('label')?.querySelector('input,textarea'))
      if (!input) return console.warn('[tut] type: not found', target)
      await T.click(input, 600)
      input.focus()
      const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      const set = Object.getOwnPropertyDescriptor(proto, 'value').set
      let v = ''
      set.call(input, '')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      for (const ch of text) {
        v += ch
        set.call(input, v)
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await sleep(1000 / cps + Math.random() * 30)
      }
      return true
    },
    /** Picks a <select> option by label text. */
    async select(target, label) {
      const lab = q(target, 'label')
      const sel = (lab && lab.querySelector('select')) || (typeof target === 'string' && target.startsWith('css:') ? q(target) : null)
      if (!sel) return console.warn('[tut] select: not found', target)
      await T.click(sel, 600)
      const opt = [...sel.options].find((o) => o.text.trim().toLowerCase().startsWith(label.toLowerCase()))
      if (!opt) return console.warn('[tut] option not found', label)
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, opt.value)
      sel.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    },
    ring(target, pad = 10) {
      let el = typeof target === 'string' ? q(target) : target
      // A heading or label stands for its whole panel / field.
      if (el && typeof target === 'string' && !target.startsWith('css:') && el.matches('h1,h2,h3,h4,b,span,small,p,div:not(.d-panel)')) el = el.closest('.d-panel, section, .d-field, label, .d-card') || el
      const ring = $('.zt-ring')
      if (!el) return ring.classList.remove('on')
      const r = el.getBoundingClientRect()
      Object.assign(ring.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' })
      ring.classList.add('on')
    },
    unring() {
      $('.zt-ring').classList.remove('on')
    },
    /** Zooms the app around an element (scale 1 = reset). */
    zoom(target, scale = 1.35) {
      const root = document.getElementById('root')
      if (!target || scale === 1) return (root.style.transform = '')
      const el = typeof target === 'string' ? q(target) : target
      if (!el) return
      const prev = root.style.transform
      root.style.transition = 'none'
      root.style.transform = ''
      const r = el.getBoundingClientRect()
      root.style.transform = prev
      void root.offsetWidth
      root.style.transition = ''
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const tx = Math.min(0, Math.max(innerWidth - innerWidth * scale, innerWidth / 2 - cx * scale))
      const ty = Math.min(0, Math.max(innerHeight - innerHeight * scale, innerHeight / 2 - cy * scale))
      root.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`
    },
    chapter(n, title) {
      const c = $('.zt-chap')
      if (!title) return c.classList.remove('on')
      c.querySelector('b').textContent = n
      c.querySelector('span').textContent = title
      c.classList.add('on')
    },
    lower(tag, title, text) {
      const l = $('.zt-lower')
      if (!title) return l.classList.remove('on')
      l.querySelector('small').textContent = tag
      l.querySelector('h4').textContent = title
      l.querySelector('p').textContent = text ?? ''
      l.classList.add('on')
    },
    /** Full-screen card. `steps` children with .zt-in reveal one by one via T.reveal(). */
    card(html, cls = '') {
      const c = $('.zt-card')
      if (!html) return c.classList.remove('on')
      c.className = 'zt-card ' + cls
      c.innerHTML = html
      void c.offsetWidth
      c.classList.add('on')
    },
    reveal(i) {
      const items = document.querySelectorAll('#tut .zt-card .zt-in')
      if (i === undefined) items.forEach((e) => e.classList.add('on'))
      else items[i]?.classList.add('on')
    },
    scroll(y, ms = 900) {
      const m = document.scrollingElement
      const from = m.scrollTop
      const t0 = performance.now()
      return new Promise((res) => {
        const step = (t) => {
          const k = Math.min(1, (t - t0) / ms)
          const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
          m.scrollTop = from + (y - from) * e
          k < 1 ? requestAnimationFrame(step) : res()
        }
        requestAnimationFrame(step)
      })
    },
    go(path) {
      history.pushState({}, '', path)
      dispatchEvent(new PopStateEvent('popstate'))
      document.scrollingElement.scrollTop = 0
    },
  }
  window.T = T
})()
