import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        for w,h in [(1280,560)]:
            pg = await (await b.new_context(viewport={'width':w,'height':h})).new_page()
            errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto('file:///home/claude/edin/game/dist/index.html?gallery=1'); await pg.wait_for_timeout(2500)
            await pg.screenshot(path='/home/claude/edin/shots/gallery.png'); print(errs)
        await b.close()
asyncio.run(main())
