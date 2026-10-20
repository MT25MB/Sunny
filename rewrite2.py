f = '/home/milan/Sunny-main/Sunny-main/index.html'
with open(f, 'r', encoding='utf-8') as fp:
    t = fp.read()

replacements = [
    ('<p class=\"hero-lead\">Sunny is a gentle AI desktop companion built for older adults. Speak naturally or type a question, and Sunny helps with your computer, medications, meals, and day \u2014 out loud, in plain language.</p>',
     '<p class=\"hero-lead\">Sunny runs on your computer and helps with everyday tasks \u2014 computer questions, medication reminders, recipes, weather. Speak or type. Sunny listens and answers out loud.</p>'),
    ('<h2>Everything Sunny can do for you</h2>',
     '<h2>What Sunny does</h2>'),
    ('<p>Simple tools for daily life, designed one button at a time.</p>',
     '<p>Five tools. Each one does one thing well.</p>'),
    ('<p>Hold the microphone and speak. Sunny transcribes your words on your computer and drops them into the box for you to check.</p>',
     '<p>Hold the button and talk. Sunny types what you said right into the box.</p>'),
    ('<h3>Recipes & cooking mode</h3>',
     '<h3>Recipes and cooking</h3>'),
    ('<p>Ask for any dish. Sunny finds a recipe, reads ingredients, and walks through each step out loud.</p>',
     '<p>Ask for a dish. Sunny finds the recipe and reads each step aloud while you cook.</p>'),
    (\"<p>Set a pill name and time. Sunny speaks up when it's time, with a big \\\"I Took It\\\" button.</p>\",
     '<p>Set a pill name and time. Sunny speaks up. Big button to mark it taken.</p>'),
    ('<h3>Computer help & health</h3>',
     '<h3>Computer help</h3>'),
    ('<p>\"My internet is slow\" or \"Is my battery okay?\" Sunny checks Wi-Fi, battery, memory, and updates in plain English.</p>',
     '<p>Ask \"why is my internet slow?\" or \"how is my battery?\" Sunny checks and tells you in plain English.</p>'),
    ('<p>Weather and headlines, read aloud in a calm voice.</p>',
     '<p>Weather and top headlines, read aloud.</p>'),
]

for old, new in replacements:
    if old in t:
        t = t.replace(old, new)
        print('Replaced:', old[:50] + '...')
    else:
        print('NOT FOUND:', old[:50] + '...')

with open(f, 'w', encoding='utf-8') as fp:
    fp.write(t)
print('Done')
