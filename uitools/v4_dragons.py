import asyncio, sys
from playwright.async_api import async_playwright
BASE='file:///home/claude/eidn/game/dist/index.html'
S='/home/claude/eidn/shots/sonra/'
async def shot(b, q, path, w=1280, h=560, wait=2500, extra=[]):
    pg = await (await b.new_context(viewport={'width':w,'height':h})).new_page()
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(BASE+q); await pg.wait_for_timeout(wait)
    await pg.screenshot(path=path)
    for (t,pth) in extra:
        await pg.wait_for_timeout(t); await pg.screenshot(path=pth)
    await pg.close(); return errs
async def main(mode):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        D=['ejder_ates','ejder_su','ejder_zehir','ejder_tas']; errs=[]
        if mode in ('all','gal'): errs+=await shot(b,'?gallery=1&set=dragons',S+'v4_dragons.png',1400,640,3000)
        if mode in ('all','close'):
            for d in (D if len(sys.argv)<3 else [sys.argv[2]]): errs+=await shot(b,f'?gallery=1&close={d}',S+f'v4_close_{d}.png',1100,520)
        if mode in ('all','anim'):
            for d in D:
                errs+=await shot(b,f'?gallery=1&close={d}&anim=finisher&dtcap=1',S+f'v4_fin_{d}_a.png',900,520,1250,[(300,S+f'v4_fin_{d}_b.png'),(300,S+f'v4_fin_{d}_c.png')])
                errs+=await shot(b,f'?gallery=1&close={d}&anim=absorb&dtcap=1',S+f'v4_abs_{d}_a.png',900,520,1500,[(500,S+f'v4_abs_{d}_b.png'),(700,S+f'v4_abs_{d}_c.png')])
        if mode in ('extra',):
            for a in ['rest','eat','die','guard','victory','gather','attackHeavy']:
                errs+=await shot(b,f'?gallery=1&close=ejder_ates&anim={a}&dtcap=1',S+f'v4_x_{a}.png',900,520,2200)
        print('errs',errs)
        await b.close()
asyncio.run(main(sys.argv[1] if len(sys.argv)>1 else 'all'))
