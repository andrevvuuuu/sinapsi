import math, sys
def circ(cx,cy,r): return f"M{cx-r:.2f} {cy:.2f}a{r} {r} 0 1 0 {2*r} 0a{r} {r} 0 1 0 {-2*r} 0Z"
def crescent(cx,cy,R,d,r,theta):
    x=(R*R-r*r+d*d)/(2*d); y=math.sqrt(R*R-x*x); t=math.radians(theta)
    rot=lambda px,py:(cx+px*math.cos(t)-py*math.sin(t), cy+px*math.sin(t)+py*math.cos(t))
    t1=rot(x,-y); t2=rot(x,y)
    return f"M{t1[0]:.2f} {t1[1]:.2f}A{R} {R} 0 1 0 {t2[0]:.2f} {t2[1]:.2f}A{r} {r} 0 1 1 {t1[0]:.2f} {t1[1]:.2f}Z"
# R, inner offset, inner r, bowl centre y, stress angle, spark r, horizontal offset of the bowls
SPECS={'final':(45,18,37.5,78,45,9,10),'small':(46,18,35,78,45,10,16)}
def parts(name,cy=126):
    R,d,r,gy,th,sp,dx=SPECS[name]
    return crescent(128-dx,cy-(128-gy),R,d,r,th), crescent(128+dx,cy+(128-gy),R,d,r,th+180), circ(128,cy,sp)
if __name__=='__main__':
    for name in SPECS:
        up,lo,spark=parts(name)
        t='<title>Sinapsi</title>'
        open(f'sinapsi-{name}.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">{t}<path d="{up}"/><path d="{lo}"/><path d="{spark}"/></svg>\n')
