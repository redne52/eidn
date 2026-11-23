import asyncio, json
from playwright.async_api import async_playwright
URL = 'file:///home/claude/eidn/game/dist/index.html'
OUT = '/home/claude/eidn/shots/'

async def main():
    res = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': 800, 'height': 360}, has_touch=True)
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
        pg.on('console', lambda m: m.type == 'error' and 'GL Driver' not in m.text and errs.append(m.text))
        ev = pg.evaluate
        await pg.goto(URL + '?test=1'); await pg.wait_for_timeout(1500)
        await pg.click('text=Başla'); await pg.wait_for_timeout(600)
        await pg.click('.story'); await pg.wait_for_timeout(1200)
        await pg.click('.card >> nth=0'); await pg.wait_for_timeout(400)
        await pg.click('text=Kan bağı kur'); await pg.wait_for_selector('text=Devam', timeout=8000)
        await pg.click('text=Devam'); await pg.wait_for_timeout(1500)
        # 1) savaş aç, 15 sn sayaç dolsun (hiçbir şey seçme)
        await ev("(()=>{const g=window.__edin.game;const m=g.monsters.find(x=>x.alive&&!x.isGuardian);g.pos.x=m.pos.x;g.pos.z=m.pos.z+1.5;})()")
        await pg.wait_for_timeout(800)
        await ev("setTimeout(()=>window.__edin.fight(),0)"); await pg.wait_for_timeout(1500)
        t0 = await ev("window.__edin.game.battle ? window.__edin.game.battle.turn : -1")
        await pg.wait_for_timeout(17500)
        t1 = await ev("window.__edin.game.battle ? window.__edin.game.battle.turn : (window.__edin.game.screen)")
        res['timer'] = {'turnBefore': t0, 'after': t1}
        await pg.screenshot(path=OUT + 'edge_timer.png')
        # 2) savaş ortasında yenile
        oz0 = await ev("window.__edin.game.carriedOz")
        await pg.reload(); await pg.wait_for_timeout(2500)
        await pg.screenshot(path=OUT + 'edge_reload_title.png')
        btn = await pg.locator('text=Devam et').count()
        if btn: await pg.click('text=Devam et'); await pg.wait_for_timeout(1800)
        res['reload'] = {'devamEt': btn, 'screen': await ev("window.__edin.game.screen"), 'battleOpen': await ev("!!window.__edin.game.battle"), 'carriedBefore': oz0, 'carriedAfter': await ev("window.__edin.game.carriedOz")}
        await pg.screenshot(path=OUT + 'edge_reload_after.png')
        # 3) yaralı iken bölge paneli
        await ev("(()=>{const g=window.__edin.game; if(g.zoneId){g.arriveAtGate&&g.arriveAtGate('test')} g.creature.woundedUntil=g.clock+40;})()")
        await pg.wait_for_timeout(800)
        sc = await ev("window.__edin.game.screen")
        res['woundScreen'] = sc
        if sc == 'gate':
            try:
                await pg.click("text=Edin'e gir"); await pg.wait_for_timeout(600)
                w1 = await pg.locator('.warn').first.inner_text()
                await pg.wait_for_timeout(2200)
                w2 = await pg.locator('.warn').first.inner_text()
                res['wound'] = {'w1': w1, 'w2': w2, 'kiyi': await ev("window.__edin.game.canEnterZone('kiyi')"), 'bozkir': await ev("window.__edin.game.canEnterZone('bozkir')")}
                await pg.screenshot(path=OUT + 'edge_wound.png')
            except Exception as e:
                res['woundErr'] = str(e)
        res['errs'] = errs
        await b.close()
    print(json.dumps(res, ensure_ascii=False, indent=1))

asyncio.run(main())
