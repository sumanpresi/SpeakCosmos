import re, json, os
D='/mnt/user-data/attachments/d9e205ea-bb05-5bd1-b9cf-8a2ffb968137/'
OUT='/home/claude/speakcosmos/assets/res/'
os.makedirs(OUT,exist_ok=True)
SRC={'what':'1b406dc5-Reservation_what_and_why_English_Bengali.txt','nehru':'52606611-Reservation_Nehru_Ambedkar_Caste_Discrimination_English_Bengali.txt','vikas':'b16bf126-Vikas_Divyakirti_Caste_Discrimination_English_Bengali.txt'}
def sec(t):
    p=[int(x) for x in t.split(':')]
    return p[0]*3600+p[1]*60+p[2] if len(p)==3 else p[0]*60+p[1]
for k,f in SRC.items():
    cur=None; en=None; rows=[]
    for l in open(D+f,encoding='utf8').read().split('\n'):
        m=re.match(r'^\[(\d+:\d+(?::\d+)?)\]',l)
        if m: cur=sec(m.group(1)); continue
        if l.startswith('English: '): en=l[9:].strip()
        elif l.startswith('বাংলা: ') and en is not None:
            rows.append([cur,en,l[len('বাংলা: '):].strip()]); en=None
    json.dump(rows,open(OUT+k+'.json','w'),ensure_ascii=False,separators=(',',':'))
    print(k,len(rows),os.path.getsize(OUT+k+'.json'))
