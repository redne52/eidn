import asyncio, sys
from playwright.async_api import async_playwright
BASE='file:///home/claude/eidn/game/dist/index.html'
async def shot(b, q, path, w=1280, h=560, wait=2500, extra=[]):
    pg = await (await b.new_context(viewport={'width':w,'height':h})).new_page()
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(BASE+q); await pg.wait_for_timeout(wait)
    await pg.screenshot(path=path)
    for i,(t,pth) in enumerate(extra):
        await pg.wait_for_timeout(t); await pg.screenshot(path=pth)
    await pg.close(); return errs
async def main(mode):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        S='/home/claude/eidn/shots/'
        errs=[]
        if mode in ('all','gal'):
            errs+=await shot(b,'?gallery=1',S+'v3_gallery.png')
        if mode in ('all','close'):
            for c in ['ugallu','girtablullu','kulullu','kusarikku']:
                errs+=await shot(b,f'?gallery=1&close={c}',S+f'v3_close_{c}.png',1100,520)
        if mode in ('all','anim'):
            for c in ['ugallu','girtablullu','kulullu','kusarikku']:
                errs+=await shot(b,f'?gallery=1&close={c}&anim=finisher',S+f'v3_fin_{c}_a.png',900,520,1500,[(250,S+f'v3_fin_{c}_b.png'),(250,S+f'v3_fin_{c}_c.png')])
        print('errs',errs)
        await b.close()
asyncio.run(main(sys.argv[1] if len(sys.argv)>1 else 'all'))
