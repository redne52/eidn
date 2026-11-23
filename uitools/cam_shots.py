# Kamera: 4 yönden bölge görüntüleri + yakın/uzak
import asyncio, math, sys
from playwright.async_api import async_playwright
W, H = 800, 360
URL = 'file:///home/claude/eidn/game/dist/index.html?test=1&dtcap=1&gfx=1'
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = await b.new_context(viewport={'width': W, 'height': H}, has_touch=True, is_mobile=True)
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    ev = pg.evaluate
    await pg.goto(URL); await pg.wait_for_timeout(1500)
    await pg.tap('text=Başla'); await pg.wait_for_timeout(600); await pg.tap('.story'); await pg.wait_for_timeout(1200)
    await pg.wait_for_selector('.card'); await pg.tap('.card >> nth=0'); await pg.wait_for_timeout(400)
    await pg.tap('text=Kan bağı kur'); await pg.wait_for_timeout(2600); await pg.wait_for_selector('text=Devam'); await pg.tap('text=Devam'); await pg.wait_for_timeout(2000)
    for zone in sys.argv[1:] or ['kiyi', 'bozkir', 'derin']:
      if zone != 'kiyi':
        await ev(f"(()=>{{const g=window.__edin.game;if(!g.unlockedZones.includes('{zone}'))g.unlockedZones.push('{zone}');g.creature.level=Math.max(g.creature.level,{ {'bozkir':5,'derin':10}[zone] });}})()")
        await ev(f"window.__edin.enterZone('{zone}')"); await pg.wait_for_timeout(2500)
      await ev("(()=>{const g=window.__edin.game;const L=g.layout();g.pos.x=L.size.w*0.5;g.pos.z=L.size.h*0.55;g.monsters.forEach(m=>{m.aggro=false;m.aggroChecked=true});const c=window.__edin.cam;c.auto=false;c.resetting=false;c.zoom=1;c.pitch=0.543;})()")
      for deg in (0, 90, 180, 270):
        await ev(f"window.__edin.cam.yaw={math.radians(deg)}"); await pg.wait_for_timeout(1300)
        await pg.screenshot(path=f'/home/claude/eidn/shots/cam_{zone}_{deg}.png')
      if zone == 'kiyi':
        await ev("(()=>{const g=window.__edin.game;const L=g.layout();g.pos.x=L.gate.x+9;g.pos.z=L.gate.z+1;const c=window.__edin.cam;c.yaw=-Math.PI/2;c.zoom=1.4;c.pitch=0.4})()"); await pg.wait_for_timeout(1500)
        d = await ev("(()=>{const v=window.__edin.view;return v.player ? v.camera.position.distanceTo(v.player.group.position) : -1})()")
        print('occlusion cam dist', round(d,2), '(tam mesafe 17.3)')
        await pg.screenshot(path='/home/claude/eidn/shots/cam_kiyi_engel.png')
      for nm, z, pt in (('yakin', 0.7, 0.45), ('uzak', 1.4, 0.75)):
        await ev(f"(()=>{{const c=window.__edin.cam;c.yaw=0.6;c.zoom={z};c.pitch={pt}}})()"); await pg.wait_for_timeout(1300)
        await pg.screenshot(path=f'/home/claude/eidn/shots/cam_{zone}_{nm}.png')
    # engel: Kıyı'da kapının hemen doğusunda, kamera batıda (kapının arkasında kalırdı)
    if 'kiyi' in (sys.argv[1:] or ['kiyi']):
      pass
    print('errs', errs)
asyncio.run(main())
