import sys,re
CART='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 7h12l-1 13H7L6 7z"/><path d="M9 7a3 3 0 016 0"/></svg>'
def nav(root, cur, announce=True):
    home = root or './'
    h=lambda a: (home+a) if root else a
    items=[('shop',root+'nest/','The Nest'),('seen',h('#seen'),'Seen in the Flock'),('events',root+'events/','Events'),('amb',root+'flock/','Ambassadors'),('story',h('#story'),'Our story')]
    li=''.join(f'<li><a href="{h}"{" aria-current=\"page\"" if k==cur else ""}>{t}</a></li>' for k,h,t in items)
    ann = ''
    cart = '#cart' if cur=='shop' else root+'nest/#cart'
    return f'''<header class="nav">{ann}
  <div class="in">
    <a class="brand" href="{home}" aria-label="Birdboost home"><span class="logo" aria-hidden="true"></span><b>BIRDBOOST</b></a>
    <nav aria-label="Main" class="menu" id="menu"><ul class="links">{li}</ul>
      <div class="menu-foot"><span data-me-slot-m></span><a href="https://www.instagram.com/birdboost_impact" target="_blank" rel="noopener">Instagram</a><a href="https://www.tiktok.com/@official_birdboost.inc" target="_blank" rel="noopener">TikTok</a></div></nav>
    <div class="navr"><span data-me-slot></span><a class="cartbtn" href="{cart}" aria-label="Cart">{CART}<b data-cart-count></b></a><button class="menubtn" type="button" aria-expanded="false" aria-controls="menu" aria-label="Menu"><i></i></button></div>
  </div>
</header>'''
def foot(root):
    home=root or './'
    return f'''<footer class="foot" id="contact"><div class="wrap">
  <div class="cols">
    <div><div class="big">Birdboost</div><p>Faith-driven clothing and community from Zimbabwe. Questions or collaborations? Message us on Instagram.</p>
      <a class="btn o" href="https://www.instagram.com/birdboost_impact" target="_blank" rel="noopener">@birdboost_impact</a></div>
    <div><h4>Explore</h4><a href="{home}">Home</a><a href="{root}nest/">The Nest</a><a href="{root}events/">Events</a><a href="{home}#story">Our story</a></div>
    <div><h4>The Flock</h4><a href="{home}#seen">Seen in the Flock</a><a href="{root}flock/share/">Share your fit</a><a href="{root}flock/">Become an ambassador</a><a href="{root}portal/">Ambassador log in</a></div>
    <div><h4>Follow</h4><a href="https://www.instagram.com/birdboost_impact" target="_blank" rel="noopener">Instagram</a><a href="https://www.tiktok.com/@official_birdboost.inc" target="_blank" rel="noopener">TikTok</a></div>
  </div>
  <div class="fine"><span>© <span data-year>2026</span> Birdboost · Faith-driven clothing and community, Zimbabwe</span><span class="serif" style="font-size:17px">God made me.</span></div>
</div></footer>'''
HEAD='''<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Instrument+Serif:ital@0;1&family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">'''
PAGES=[('home.html','index.html','','home'),('nest.html','nest/index.html','../','shop'),('piece.html','nest/piece/index.html','../../','shop'),
       ('flock.html','flock/index.html','../','amb'),('share.html','flock/share/index.html','../../','amb'),('events.html','events/index.html','../','events')]
def build(src,dst,root,cur,announce=True):
    s=open(src).read()
    s=s.replace('<!--HEAD-->',HEAD).replace('<!--NAV-->',nav(root,cur,announce)).replace('<!--FOOT-->',foot(root))
    open(dst,'w').write(s)
if __name__=='__main__':
    # Builds the public pages from the sources in this folder: python3 _build/partials.py
    import os
    B=os.path.dirname(os.path.abspath(__file__))+'/'; R=os.path.dirname(B.rstrip('/'))+'/'
    for src,dst,root,cur in PAGES:
        if os.path.exists(B+src): os.makedirs(os.path.dirname(R+dst) or R, exist_ok=True); build(B+src,R+dst,root,cur)
