import asyncio, sys, json
from playwright.async_api import async_playwright
URL = 'file:///home/claude/eidn/game/dist/index.html'
OUT = '/home/claude/eidn/shots/'
# Tam akış (v3): seçim → Kıyı → savaş (kombo/bitirici) → zafer → yenilgi → dönüş büyüsü/öz yatırma → kaydet-yükle → bölge geçişi
async def main(w, h, card):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=True, device_scale_factor=1)
        pg = await ctx.new_page(); errs = []; log = {}
        pg.on('console', lambda m: m.type == 'error' and 'GPU stall' not in m.text and errs.append(m.text))
        pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
        async def ev(js): return await pg.evaluate(js)
        async def shot(n): await pg.screenshot(path=f'{OUT}v3_flow_{n}.png')
        await pg.goto(URL + '?test=1&dtcap=1'); await pg.wait_for_timeout(1500)
        await pg.click('text=Başla'); await pg.wait_for_timeout(600); await pg.click('.story'); await pg.wait_for_timeout(1200)
        await pg.wait_for_selector('.card'); await pg.click(f'.card >> nth={card}'); await pg.wait_for_timeout(400)
        await pg.click('text=Kan bağı kur'); await pg.wait_for_timeout(2600); await pg.wait_for_selector('text=Devam'); await pg.click('text=Devam'); await pg.wait_for_timeout(1500)
        log['zone'] = await ev("window.__edin.game.zoneId")
        async def near():
            await ev("(()=>{const g=window.__edin.game;const m=g.monsters.find(x=>x.alive&&!x.isGuardian);g.pos.x=m.pos.x;g.pos.z=Math.min(m.pos.z+1.5,g.layout().size.h-1);})()"); await pg.wait_for_timeout(500)
        async def fight(lose=False):
            await ev("(window.__edin.game.screen==='world' && setTimeout(()=>window.__edin.fight()), 0)"); await pg.wait_for_timeout(1300)
            if lose: await ev("(()=>{const b=window.__edin.game.battle; b.player.hp=1; b.enemy.hp=b.enemy.maxHp;})()")
            kinds = []
            for i in range(50):
                if not await ev("!!(window.__edin.game.battle && !window.__edin.game.battle.over)"): break
                k = await ev("""(()=>{const t=document.querySelector('.tele');const tv=t&&t.style.display!=='none';
                  const f=document.querySelector('.mv-fin.full'); if(f){f.click();return 'fin';}
                  if(tv){document.querySelector('.mv-guard').click();return 'guard';}
                  const g=document.querySelector('.mv.glow')||document.querySelector('.mv-quick'); if(!g) return 'none'; g.click(); return g.classList.contains('glow')?'combo':'quick';})()""")
                kinds.append(k); await pg.wait_for_timeout(1900)
            await pg.wait_for_timeout(1500)
            return kinds
        await near(); kinds = await fight(); log['win_moves'] = kinds; await shot('a_result')
        log['ev_combo_seen'] = await ev("(window.__edin.game.battle?.log||[]).some?.(e=>e.type==='combo')")
        log['carried_after_win'] = await ev("window.__edin.game.carriedOz")
        if await pg.locator('.rbox .btn').count(): await pg.click('.rbox .btn'); await pg.wait_for_timeout(900)
        log['screen_after_win'] = await ev("window.__edin.game.screen")
        # dönüş büyüsüyle öz taşı
        await ev("window.__edin.game.startReturn()"); await pg.wait_for_timeout(12500); await shot('b_gate')
        log['after_return'] = await ev("({screen: window.__edin.game.screen, carried: window.__edin.game.carriedOz, banked: window.__edin.game.creature.oz, lvl: window.__edin.game.creature.level})")
        if await pg.locator('.rbox .btn').count(): await pg.click('.rbox .btn'); await pg.wait_for_timeout(800)
        # kaydet → yeniden yükle
        await ev("window.__edin.core.writeSave && window.__edin.core.writeSave(window.__edin.game)")
        before = await ev("JSON.stringify({oz: window.__edin.game.creature.oz, lvl: window.__edin.game.creature.level, sekel: window.__edin.game.sekel})")
        await pg.reload(); await pg.wait_for_timeout(1800)
        if await pg.locator('text=Devam et').count(): await pg.click('text=Devam et'); await pg.wait_for_timeout(1500)
        after = await ev("JSON.stringify({oz: window.__edin.game.creature.oz, lvl: window.__edin.game.creature.level, sekel: window.__edin.game.sekel})")
        log['save_load'] = [before, after]
        # bölge geçişi (Bozkır'ı aç) ve yenilgi
        await ev("(()=>{const g=window.__edin.game; if(!g.unlockedZones.includes('bozkir')) g.unlockedZones.push('bozkir');})()")
        await ev("window.__edin.enterZone('bozkir')"); await pg.wait_for_timeout(2500); await shot('c_bozkir')
        log['zone2'] = await ev("window.__edin.game.zoneId")
        await near(); await fight(lose=True); await shot('d_lose')
        log['after_lose'] = await ev("window.__edin.game.screen")
        log['turns'] = await ev("(window.__edinTurns||[]).map(t=>t.ms)")
        log['errs'] = errs[:8]
        print(json.dumps(log))
        await b.close()
asyncio.run(main(int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3]) if len(sys.argv) > 3 else 0))
