import asyncio, sys, json
from playwright.async_api import async_playwright
URL = 'file:///home/claude/eidn/game/dist/index.html'
OUT = '/home/claude/eidn/shots/'

async def main(w, h, tag, card):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=True, device_scale_factor=1)
        pg = await ctx.new_page()
        errs = []
        pg.on('console', lambda m: m.type in ('error','warning') and errs.append(m.text))
        pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
        await pg.goto(URL + '?test=1'); await pg.wait_for_timeout(1500)
        async def shot(n): await pg.screenshot(path=f'{OUT}int_{tag}_{n}.png')
        async def ev(js): return await pg.evaluate(js)
        async def fight_to_end():
            for i in range(40):
                if await pg.locator('.result').count(): break
                await pg.wait_for_timeout(1200)
                await ev("(()=>{const a=document.querySelector('.atk .zbtn'), g=document.querySelectorAll('.grd .zbtn')[1]; if(a&&!a.classList.contains('on')) a.click(); if(g&&!g.classList.contains('on')) g.click(); document.querySelector('.confirm.ready')?.click();})()")
            await pg.wait_for_timeout(1200)
        async def go_near(sel):
            await ev("(()=>{const g=window.__edin.game;const m=g.monsters.find(x=>x.alive&&(%s));g.pos.x=m.pos.x;g.pos.z=Math.min(m.pos.z+1.5, g.layout().size.h-1);})()" % sel)
            await pg.wait_for_timeout(800)

        await shot('01_title')
        await pg.click('text=Başla'); await pg.wait_for_timeout(600)
        await pg.click('.story'); await pg.wait_for_timeout(1200)
        await pg.click(f'.card >> nth={card}'); await pg.wait_for_timeout(400)
        await pg.click('text=Kan bağı kur'); await pg.wait_for_timeout(2600)
        await pg.wait_for_selector('text=Devam', timeout=8000); await pg.wait_for_timeout(300)
        await shot('02_hatch')
        await pg.click('text=Devam'); await pg.wait_for_timeout(1500)
        await shot('03_world')
        await ev("window.__edin.game.setTestOz(true)")
        await go_near('!x.isGuardian')
        await shot('04_near')
        await ev("(window.__edin.game.screen==='world' && setTimeout(()=>window.__edin.fight()), 0)"); await pg.wait_for_timeout(1400)
        await shot('05_battle')
        await fight_to_end()
        await shot('06_result')
        await pg.click('.rbox .btn'); await pg.wait_for_timeout(800)
        for k in range(3):  # birkaç zafer daha
            await go_near('!x.isGuardian')
            if not await ev("!!window.__edin.game.nearbyMonster"): continue
            await ev("(window.__edin.game.screen==='world' && setTimeout(()=>window.__edin.fight()), 0)"); await pg.wait_for_timeout(1200)
            await fight_to_end()
            if await pg.locator('.rbox .btn').count(): await pg.click('.rbox .btn'); await pg.wait_for_timeout(800)
            if not await ev("!!window.__edin.game.zoneId"): break
        await shot('07_world_oz')
        if await ev("!!window.__edin.game.zoneId"):
            await pg.click('.br .ret'); await pg.wait_for_timeout(11500)
        await shot('08_arrive')
        await pg.click('.rbox .btn'); await pg.wait_for_timeout(1200)
        await shot('09_gate')
        await pg.click("text=Edin'e gir"); await pg.wait_for_timeout(500); await shot('10_zones'); await pg.click('.close')
        await pg.click('text=Yaratık'); await pg.wait_for_timeout(400); await shot('11_creature'); await pg.click('.close')
        await pg.click('text=Dükkân'); await pg.wait_for_timeout(400)
        await pg.click('.irow .btn >> nth=0'); await pg.wait_for_timeout(200)
        await shot('12_shop'); await pg.click('.close'); await pg.wait_for_timeout(600)
        # yumurtalar: bir yumurta ekle, biri çatlamış
        await ev("(()=>{const g=window.__edin.game;g.addEgg('kusarikku','B','guardian');const e=g.addEgg('kulullu','A','kader');e.heat=99;e.hatched=true;})()")
        await pg.click('text=Çanta'); await pg.wait_for_timeout(400); await shot('13_bag')
        await pg.click('text=Bağı yenile'); await pg.wait_for_timeout(300); await shot('14_bond_warn'); await pg.click('.close'); await pg.wait_for_timeout(600)
        # ölüm: koruma bitmiş, Bozkır, can 1
        print('DIAG', await ev("(()=>{const e=window.__edin;const g=e.game;g.runsCompleted=5;g.creature.woundedUntil=0;g.unlockedZones.push('bozkir');const d={can:g.canEnterZone('bozkir'),w:g.isWounded(),wu:g.creature.woundedUntil,cl:g.clock,scr:g.screen,inRun:g.inRun};e.enterZone('bozkir');d.after=g.screen;g.carriedOz=200;g.creature.hp=1;return d;})()")); await pg.wait_for_timeout(1000)
        await shot('15_bozkir')
        await go_near('!x.isGuardian')
        await ev("(window.__edin.game.screen==='world' && setTimeout(()=>window.__edin.fight()), 0)"); await pg.wait_for_timeout(1200)
        await fight_to_end()
        await shot('16_defeat')
        await pg.click('.rbox .btn'); await pg.wait_for_timeout(900)
        await shot('17_after_death')
        if await pg.locator('.rbox .btn').count(): await pg.click('.rbox .btn'); await pg.wait_for_timeout(900)
        await shot('18_gate_after')
        # bekçi
        await ev("(()=>{const e=window.__edin;const g=e.game;g.creature.woundedUntil=0;g.creature.level=6;e.enterZone('kiyi');})()"); await pg.wait_for_timeout(1000)
        await go_near('x.isGuardian')
        await shot('19_boss_world')
        await ev("(window.__edin.game.screen==='world' && setTimeout(()=>window.__edin.fight()), 0)"); await pg.wait_for_timeout(1400); await shot('20_boss_battle')
        # zorunlu savaş: saldırgan canavar dokunur
        await pg.wait_for_timeout(500)
        await ev("(()=>{const r=document.querySelector('.battle'); })()")
        print(json.dumps({'errs': errs[:20], 'screen': await ev("window.__edin.game.screen")}, ensure_ascii=False))
        await b.close()

w, h, t, c = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 0
asyncio.run(main(w, h, t, c))
