import asyncio, sys, json
from playwright.async_api import async_playwright
URL = 'file:///home/claude/edin/game/dist/index.html'
OUT = '/home/claude/edin/shots/'
# kullanım: v3_battle.py <w> <h> <etiket> <kart 0-3> [ek_sorgu] [mod: fin|full]
async def main(w, h, tag, card, extra='', mode='fin'):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=True, device_scale_factor=1)
        pg = await ctx.new_page(); errs = []
        pg.on('console', lambda m: m.type == 'error' and 'GPU stall' not in m.text and errs.append(m.text))
        pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
        await pg.goto(URL + '?test=1' + extra); await pg.wait_for_timeout(1500)
        async def shot(n): await pg.screenshot(path=f'{OUT}v3_{tag}_{n}.png')
        async def ev(js): return await pg.evaluate(js)
        await pg.click('text=Başla'); await pg.wait_for_timeout(600)
        await pg.click('.story'); await pg.wait_for_timeout(1200)
        await pg.wait_for_selector('.card', timeout=10000); await pg.click(f'.card >> nth={card}'); await pg.wait_for_timeout(400)
        await pg.click('text=Kan bağı kur'); await pg.wait_for_timeout(2600)
        await pg.wait_for_selector('text=Devam', timeout=8000)
        await pg.click('text=Devam'); await pg.wait_for_timeout(1500)
        await ev("(()=>{const g=window.__edin.game;const m=g.monsters.find(x=>x.alive&&!x.isGuardian);g.pos.x=m.pos.x;g.pos.z=Math.min(m.pos.z+1.5,g.layout().size.h-1);})()")
        await pg.wait_for_timeout(800)
        await ev("(window.__edin.game.screen==='world' && setTimeout(()=>window.__edin.fight()), 0)"); await pg.wait_for_timeout(1500)
        res = {'screen': await ev("window.__edin.game.screen"), 'mv': await pg.locator('.mv-guard').count()}
        await shot('0_start')
        if mode == 'fin':
            await ev("(()=>{const b=window.__edin.game.battle;b.player.points=5;b.player.history=[];b.enemy.telegraph=null;b.enemy.intent='quick';b.player.hp=b.player.maxHp;b.enemy.hp=b.enemy.maxHp;})()")
            # puan noktalarıyla düğmeyi eşitlemek için bir tur oynat (render)
            await ev("document.querySelector('.mv-guard').click()"); await pg.wait_for_timeout(2600)
            await ev("(()=>{const b=window.__edin.game.battle;b.player.points=5;b.enemy.telegraph=null;b.enemy.intent='quick';b.enemy.hp=b.enemy.maxHp;})()")
            await ev("document.querySelector('.mv-guard').click()"); await pg.wait_for_timeout(2600)
            await ev("(()=>{const b=window.__edin.game.battle;b.player.points=5;b.enemy.telegraph=null;b.enemy.intent='quick';b.enemy.hp=b.enemy.maxHp;})()")
            await shot('a_ready')
            res['pipsVsBtn'] = await ev("[document.querySelectorAll('.bbar.left .pips i.on').length, document.querySelector('.mv-fin small').textContent]")
            await ev("document.querySelector('.mv-fin').click()")
            for i, t in enumerate([350, 300, 300, 350]):
                await pg.wait_for_timeout(t); await shot(f'b_fin{i}')
            await pg.wait_for_timeout(2500)
            res['turns'] = await ev("window.__edinTurns"); res['ev'] = await ev("window.__edinEv")
        else:
            for i in range(40):
                if await pg.locator('.result').count() or await ev("!window.__edin.game.battle"): break
                await ev("""(()=>{const t=document.querySelector('.tele');const tv=t&&t.style.display!=='none';
                  const f=document.querySelector('.mv-fin.full'); if(f){f.click();return 'fin';}
                  if(tv){document.querySelector('.mv-guard').click();return 'guard';}
                  const g=document.querySelector('.mv.glow')||document.querySelector('.mv-quick'); g&&g.click(); return 'x';})()""")
                await pg.wait_for_timeout(300)
                if i in (1, 3): await shot(f'c_t{i}')
                await pg.wait_for_timeout(2300)
            await shot('d_end')
            res['turns'] = await ev("window.__edinTurns")
        res['errs'] = errs[:8]
        print(json.dumps({'tag': tag, **res}))
        await b.close()
a = sys.argv[1:]
asyncio.run(main(int(a[0]), int(a[1]), a[2], int(a[3]), a[4] if len(a) > 4 else '', a[5] if len(a) > 5 else 'fin'))
