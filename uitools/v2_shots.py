import asyncio, sys, json
from playwright.async_api import async_playwright
URL = 'file:///home/claude/eidn/game/dist/index.html'
OUT = '/home/claude/eidn/shots/'
async def main(w, h, tag, card, lvl):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=True, device_scale_factor=1)
        pg = await ctx.new_page(); errs = []
        pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
        await pg.goto(URL + '?test=1'); await pg.wait_for_timeout(1500)
        async def shot(n): await pg.screenshot(path=f'{OUT}v2_{tag}_{n}.png')
        async def ev(js): return await pg.evaluate(js)
        await pg.click('text=Başla'); await pg.wait_for_timeout(600)
        await pg.click('.story'); await pg.wait_for_timeout(1200)
        await pg.wait_for_selector('.card', timeout=10000); await pg.click(f'.card >> nth={card}'); await pg.wait_for_timeout(400)
        await pg.click('text=Kan bağı kur'); await pg.wait_for_timeout(2600)
        await pg.wait_for_selector('text=Devam', timeout=8000)
        await pg.click('text=Devam'); await pg.wait_for_timeout(1500)
        if 1 < lvl < 99: await ev(f"window.__edin.game.creature.level={lvl}")
        await ev("(()=>{const g=window.__edin.game;const m=g.monsters.find(x=>x.alive&&!x.isGuardian);g.pos.x=m.pos.x;g.pos.z=Math.min(m.pos.z+1.5,g.layout().size.h-1);})()")
        await pg.wait_for_timeout(800)
        await ev("(window.__edin.game.screen==='world' && setTimeout(()=>window.__edin.fight()), 0)"); await pg.wait_for_timeout(1500)
        await shot('01_start')
        if lvl==99:
            await ev("(()=>{const b=window.__edin.game.battle;b.player.points=4;b.player.history=['quick','quick'];b.enemy.telegraph=null;b.enemy.intent='quick';b.player.hp=b.player.maxHp;})()")
            await pg.click('.mv-quick'); await pg.wait_for_timeout(300); await pg.click('.mv-heavy'); await pg.wait_for_timeout(1300); await shot('50_combo'); await pg.wait_for_timeout(2500); await shot('51_full')
            await pg.click('.mv-fin'); await pg.wait_for_timeout(900); await shot('52_fin'); return
        n = 2
        for i in range(30):
            if await pg.locator('.result').count(): break
            # parlayan hamleyi oyna; telgraf varsa savunma; 5 puanda bitirici
            r = await ev("""(()=>{const t=document.querySelector('.tele');const tv=t&&t.style.display!=='none';
              const f=document.querySelector('.mv-fin.full'); if(f){f.click();return 'fin';}
              if(tv){document.querySelector('.mv-guard').click();return 'guard';}
              const g=document.querySelector('.mv.glow')||document.querySelector('.mv-quick'); g.click(); return g.className;})()""")
            await pg.wait_for_timeout(450)
            if n <= 9 and i in (0,1,2,4,6,9,12): await shot(f'{n:02d}_t{i}'); n += 1
            await pg.wait_for_timeout(1700)
        await shot('99_end')
        print(json.dumps({'errs': errs[:8]}))
        await b.close()
asyncio.run(main(int(sys.argv[1]), int(sys.argv[2]), sys.argv[3], int(sys.argv[4]), int(sys.argv[5]) if len(sys.argv)>5 else 1))
