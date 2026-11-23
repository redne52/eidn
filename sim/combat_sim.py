"""Edin savas simulasyonu: python3 -I combat_sim.py /home/claude/edin/data/rules.json"""
import json, random, sys, statistics as st
R = json.load(open(sys.argv[1]))
C = R["constants"]

def stats_creature(cid, level, grade):
    c = R["creatures"][cid]; g = R["grades"][grade]["statMult"]
    s = {k: c["base"][k] + c["growth"][k]*(level-1) for k in c["base"]}
    s["hp"] *= g; s["atk"] *= g
    if c["passive"]["effect"].get("flatBlok"): s["blok"] += c["passive"]["effect"]["flatBlok"]
    return dict(s=s, kind="creature", id=cid, grade=grade, level=level, def_=c)

def stats_monster(mon, level, guardian=False):
    t = R["monsterTemplate"]
    s = {k: t["base"][k] + t["growth"][k]*(level-1) for k in t["base"]}
    for k, v in mon.get("mods", {}).items(): s[k] *= v
    return dict(s=s, kind="monster", id=mon["id"], level=level, def_=mon)

TURN=[0]
def heal_mult():
    return C["fatigueHealMult"] if TURN[0] >= C.get("fatigueTurn",99) else 1

def ch(v, opp=None, cap=C["chanceCap"]):
    return min(cap, v/(v+100))

def fight(a, b, maxT=60):
    for f in (a, b):
        f["hp"] = f["s"]["hp"]; f["cd"] = 0; f["cd2"] = 0; f["eff"] = {}
    turns = 0; TURN[0] = 0
    while a["hp"] > 0 and b["hp"] > 0 and turns < maxT:
        turns += 1; TURN[0] = turns
        order = [a, b] if a["s"]["cev"]*(a["eff"].get("slow",1)) >= b["s"]["cev"]*(b["eff"].get("slow",1)) else [b, a]
        for f in (a, b):
            f["guard"] = random.choice(C["zones"]); f["stance"] = False
        for att in order:
            dfn = b if att is a else a
            if att["hp"] <= 0 or dfn["hp"] <= 0: continue
            if att["eff"].pop("stun", 0): continue
            act(att, dfn)
        for f in (a, b):  # tur sonu etkiler
            for k in ("poison", "bleed"):
                if k in f["eff"]:
                    dmg, left = f["eff"][k]; f["hp"] -= dmg
                    f["eff"][k] = (dmg, left-1)
                    if left-1 <= 0: del f["eff"][k]
            if f["kind"] == "creature" and f["def_"]["passive"]["effect"].get("regenMaxHpPerTurn"):
                f["hp"] = min(f["s"]["hp"], f["hp"] + f["s"]["hp"]*f["def_"]["passive"]["effect"]["regenMaxHpPerTurn"]*heal_mult())
            for k in ("shield", "weak", "slowT", "reflect"):
                if k in f["eff"]:
                    f["eff"][k] = (f["eff"][k][0], f["eff"][k][1]-1)
                    if f["eff"][k][1] <= 0:
                        del f["eff"][k]
                        if k == "slowT": f["eff"].pop("slow", None)
            f["cd"] = max(0, f["cd"]-1); f["cd2"] = max(0, f["cd2"]-1)
    return a["hp"] > 0 and b["hp"] <= 0, turns, max(0, a["hp"])/a["s"]["hp"]

def hit(att, dfn, mult=1.0, undodge=False):
    s, d = att["s"], dfn["s"]
    if not undodge:
        dc = min(C["dodgeCap"], d["cev"]*dfn["eff"].get("slow",1)/(d["cev"]*dfn["eff"].get("slow",1)+s["cev"]+100))
        if random.random() < dc: return 0
    atk = s["atk"] * (att["eff"]["weak"][0] if "weak" in att["eff"] else 1)
    dmg = atk*100/(100+d["def"])*random.uniform(C["randMin"], C["randMax"])*mult
    zone = random.choice(C["zones"])
    if zone == dfn["guard"]: dmg *= C["guardedMult"]
    elif random.random() < ch(d["blok"]):
        dmg *= C["blockMult"]
        if dfn["kind"] == "creature" and dfn["def_"]["passive"]["effect"].get("counterOnBlockAtkMult"):
            att["hp"] -= d["atk"]*dfn["def_"]["passive"]["effect"]["counterOnBlockAtkMult"]
    else:
        if random.random() < ch(s["krit"]):
            cm = att["def_"]["passive"]["effect"].get("critMult", C["critMult"]) if att["kind"] == "creature" else C["critMult"]
            dmg *= cm
    if "shield" in dfn["eff"]: dmg *= dfn["eff"]["shield"][0]
    if "reflect" in dfn["eff"]: att["hp"] -= dmg*dfn["eff"]["reflect"][0]
    if TURN[0] >= C.get("fatigueTurn",99): dmg *= 1 + C["fatigueDamagePerTurn"]*(TURN[0]-C["fatigueTurn"]+1)
    dfn["hp"] -= dmg
    return dmg

def act(att, dfn):
    if att["kind"] == "monster":
        if hit(att, dfn) > 0 and att["def_"].get("status") and random.random() < R["statusEffects"]["canavar_etkisi"]["chance"]:
            dfn["eff"]["poison" if att["def_"]["status"] != "kanama" else "bleed"] = (att["s"]["atk"]*0.3, 2)
        return
    c = att["def_"]; lvl = att["level"]
    if lvl >= C["secondSkillLevel"] and R["grades"][att["grade"]]["secondSkill"] and att["cd2"] == 0:
        e = c["second"]["effect"]; att["cd2"] = c["second"]["cooldown"]
        hit(att, dfn, e.get("damageMult", 1))
        if "enemyAtkMult" in e: dfn["eff"]["weak"] = (e["enemyAtkMult"], e["turns"])
        if "reflect" in e: att["eff"]["reflect"] = (e["reflect"], e["turns"])
        if "slow" in e: dfn["eff"]["slow"] = e["slow"]["cevMult"]; dfn["eff"]["slowT"] = (0, e["slow"]["turns"])
        if "stunChance" in e and random.random() < e["stunChance"]: dfn["eff"]["stun"] = 1
        return
    if lvl >= C["skillUnlockLevel"] and att["cd"] == 0:
        e = c["active"]["effect"]
        if "healMaxHp" in e:
            if att["hp"] < att["s"]["hp"]*0.6:
                att["hp"] = min(att["s"]["hp"], att["hp"]+att["s"]["hp"]*e["healMaxHp"]*heal_mult()); att["cd"] = c["active"]["cooldown"]; return
        else:
            att["cd"] = c["active"]["cooldown"]
            if "takenMult" in e: att["eff"]["shield"] = (e["takenMult"], e["turns"])
            hit(att, dfn, e.get("damageMult", 1), e.get("undodgeable", False))
            if "poison" in e: dfn["eff"]["poison"] = (att["s"]["atk"]*e["poison"]["perTurnAtkMult"], e["poison"]["turns"])
            return
    hit(att, dfn)

def run(n=3000):
    random.seed(7)
    out = {}
    # 1) ayni seviye siradan canavar (sablon mods=1)
    flat = {"id": "test", "mods": {}, "status": None}
    for lvl in (1, 5, 9, 13):
        for cid in R["creatures"]:
            res = [fight(stats_creature(cid, lvl, "C"), stats_monster(flat, lvl)) for _ in range(n)]
            out[("mob", cid, lvl)] = (sum(r[0] for r in res)/n, st.mean(r[1] for r in res), 1-st.mean(r[2] for r in res if r[0]))
    # 2) bekci (kendi seviyesinde, C ve 2 seviye ustunden)
    for z in R["zones"]:
        gd = z["guardian"]
        for cid in R["creatures"]:
            res = [fight(stats_creature(cid, gd["level"], "C"), stats_monster(gd, gd["level"])) for _ in range(n)]
            out[("guard", cid, gd["id"])] = (sum(r[0] for r in res)/n, st.mean(r[1] for r in res))
    # 3) ayni tur S vs C, 13. seviye
    for cid in R["creatures"]:
        for g in ("B", "A", "S"):
            res = [fight(stats_creature(cid, 13, g), stats_creature(cid, 13, "C")) for _ in range(n)]
            out[("grade", cid, g)] = (sum(r[0] for r in res)/n, st.mean(r[1] for r in res))
    # 4) turler arasi C vs C 13
    ids = list(R["creatures"])
    for i in ids:
        for j in ids:
            if i < j:
                res = [fight(stats_creature(i, 13, "C"), stats_creature(j, 13, "C")) for _ in range(n)]
                out[("cross", i, j)] = (sum(r[0] for r in res)/n, st.mean(r[1] for r in res))
    return out

if __name__ == "__main__":
    o = run()
    for k, v in o.items(): print(k, tuple(round(x, 2) for x in v))
    # seviye suresi tahmini
    f = R["formulas"]
    print("--- seviye suresi (Ugallu C, ayni seviye canavar, tur 4 sn, yurume+toparlanma 25 sn) ---")
    tot = 0
    for L in range(1, 13):
        need = round(100*L**1.6/10)*10
        zm = 1.0 if L <= 4 else (1.5 if L <= 9 else 2.2)
        per = (10+5*L)*zm
        kills = need/per
        turns = o[("mob", "ugallu", min((1,5,9,13), key=lambda x: abs(x-L)))][1]
        mins = kills*(turns*4+25)/60; tot += mins
        print(L, "->", L+1, "av", round(kills,1), "dk", round(mins,1))
    print("toplam dk", round(tot))
