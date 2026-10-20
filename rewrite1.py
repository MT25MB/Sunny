f = '/home/milan/Sunny-main/Sunny-main/index.html'
with open(f, 'r', encoding='utf-8') as fp:
    t = fp.read()

old = '<span class="hero-trust">Free and open source \u00b7 No accounts \u00b7 No tracking</span>'
new = '<span class="hero-trust">Free. Open source. No accounts. No tracking.</span>'
if old in t:
    t = t.replace(old, new)
    print('Replaced')
else:
    print('NOT FOUND')

with open(f, 'w', encoding='utf-8') as fp:
    fp.write(t)
print('Done')
