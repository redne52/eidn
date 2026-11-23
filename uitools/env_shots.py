import asyncio, sys, json
from playwright.async_api import async_playwright
URL = 'file:///home/claude/eidn/game/dist/index.html'
OUT = '/home/claude/eidn/shots/'
# kullanım: env_shots.py <etiket> <shot> <cam> [gfx] [w h] [bekleme_ms]
async def main(tag, shot, cam, gfx='1', w=800, h=360, wait=3500):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=True, device_scale_factor=1)
        pg = await ctx.new_page(); errs = []
        pg.on('console', lambda m: m.type == 'error' and 'GPU stall' not in m.text and errs.append(m.text))
        pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
        await pg.goto(f'{URL}?test=1&gfx={gfx}&shot={shot}&cam={cam}'); await pg.wait_for_timeout(int(wait))
        await pg.screenshot(path=f'{OUT}env_{tag}.png')
        perf = await pg.evaluate("window.__edin.perf()")
        t0 = await pg.evaluate("performance.now()"); f0 = await pg.evaluate("new Promise(r=>{let n=0;const t=performance.now();function s(){n++; if(performance.now()-t<2000) requestAnimationFrame(s); else r(n/2)} requestAnimationFrame(s)})")
        print(json.dumps({'tag': tag, 'perf': perf, 'fps_swiftshader': f0, 'errs': errs[:6]}))
        await b.close()
a = sys.argv[1:]
asyncio.run(main(a[0], a[1], a[2], a[3] if len(a) > 3 else '1', int(a[4]) if len(a) > 4 else 800, int(a[5]) if len(a) > 5 else 360, int(a[6]) if len(a) > 6 else 3500))
