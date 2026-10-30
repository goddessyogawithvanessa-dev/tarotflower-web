-- Approved suite. No historical subscriber enrollment or delivery backfill.
INSERT INTO email_sequences(id,slug,name,trigger_tag,status) VALUES ('tf-suite-goddess-guide-welcome','goddess-guide-welcome','goddess-guide-welcome','lead:goddess-embodiment-guide','active') ON CONFLICT(slug) DO UPDATE SET trigger_tag=excluded.trigger_tag,status='active',updated_at=CURRENT_TIMESTAMP;
INSERT INTO email_sequences(id,slug,name,trigger_tag,status) VALUES ('tf-suite-oracle-waitlist-welcome','oracle-waitlist-welcome','oracle-waitlist-welcome','interest:sacred-becoming-oracle','active') ON CONFLICT(slug) DO UPDATE SET trigger_tag=excluded.trigger_tag,status='active',updated_at=CURRENT_TIMESTAMP;
INSERT INTO email_sequences(id,slug,name,trigger_tag,status) VALUES ('tf-suite-tarot-newsletter-welcome','tarot-newsletter-welcome','tarot-newsletter-welcome','list:tarot-flower-newsletter','active') ON CONFLICT(slug) DO UPDATE SET trigger_tag=excluded.trigger_tag,status='active',updated_at=CURRENT_TIMESTAMP;
INSERT INTO email_sequence_steps(id,sequence_id,step_order,slug,title,description,delay_hours,status,subject,html_template,text_template,email_type) SELECT 'tf-suite-guide-fulfillment',id,1,'guide-fulfillment','Your Goddess Embodiment Guide is here ✨','Approved Tarot Flower email',0,'active','Your Goddess Embodiment Guide is here ✨','<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#121113;font-family:Georgia,serif;color:#211c19"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" style="max-width:620px;background:#f3ead9;border:1px solid #9b773c"><tr><td style="padding:24px;background:#181416;color:#c5a15c;text-align:center;font:12px Arial;letter-spacing:.2em">TAROT FLOWER</td></tr><tr><td style="padding:32px 24px"><p style="margin:0 0 20px;font-size:17px;line-height:1.7">Hey, Goddess,</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">I’m so happy you’re here.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">Your Goddess Embodiment Guide is ready for you.</p><p style="margin:26px 0"><a href="{{guide_download_url}}" style="display:inline-block;padding:14px 22px;border:1px solid #a17d47;background:#211c19;color:#f3ead9;text-decoration:none;font:13px Arial;letter-spacing:.08em">DOWNLOAD YOUR GUIDE</a></p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">This guide is the foundation of Goddess Embodiment and many of the practices we’ll explore together. Inside you’ll find rituals, journal prompts, and simple practices for bringing the Goddess into your body, your choices, and your everyday life.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">Pour yourself a cup of tea or a glass of wine, find a little space for yourself, and explore it at your own pace.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">And if something in the guide sparks a question, a revelation, or simply makes you want to tell me something, reply to this email. It comes directly to me.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">Have fun with it.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">XOXO,<br>Vanessa</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">You’re receiving this because you requested the Goddess Embodiment Guide from Tarot Flower.<br>Unsubscribe: {{unsubscribe_url}}</p></td></tr></table></td></tr></table></body></html>','Hey, Goddess,

I’m so happy you’re here.

Your Goddess Embodiment Guide is ready for you.

DOWNLOAD YOUR GUIDE
{{guide_download_url}}

This guide is the foundation of Goddess Embodiment and many of the practices we’ll explore together. Inside you’ll find rituals, journal prompts, and simple practices for bringing the Goddess into your body, your choices, and your everyday life.

Pour yourself a cup of tea or a glass of wine, find a little space for yourself, and explore it at your own pace.

And if something in the guide sparks a question, a revelation, or simply makes you want to tell me something, reply to this email. It comes directly to me.

Have fun with it.

XOXO,
Vanessa

You’re receiving this because you requested the Goddess Embodiment Guide from Tarot Flower.
Unsubscribe: {{unsubscribe_url}}','welcome' FROM email_sequences WHERE slug='goddess-guide-welcome' ON CONFLICT(sequence_id,slug) DO UPDATE SET title=excluded.title,description=excluded.description,delay_hours=excluded.delay_hours,status='active',subject=excluded.subject,html_template=excluded.html_template,text_template=excluded.text_template,email_type=excluded.email_type,updated_at=CURRENT_TIMESTAMP;
INSERT INTO email_sequence_steps(id,sequence_id,step_order,slug,title,description,delay_hours,status,subject,html_template,text_template,email_type) SELECT 'tf-suite-related-rituals-resources',id,2,'related-rituals-resources','The strange magic of transmutation','Approved Tarot Flower email',72,'active','The strange magic of transmutation','<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#121113;font-family:Georgia,serif;color:#211c19"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" style="max-width:620px;background:#f3ead9;border:1px solid #9b773c"><tr><td style="padding:24px;background:#181416;color:#c5a15c;text-align:center;font:12px Arial;letter-spacing:.2em">TAROT FLOWER</td></tr><tr><td style="padding:32px 24px"><p style="margin:0 0 20px;font-size:17px;line-height:1.7">Hey, Goddess,</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">Have you ever wondered what you’re supposed to do with all the crazy shit that happens to you?</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">The heartbreaks. The wrong turns. The things you didn’t choose. The things you did choose and wish you hadn’t. The anger, the grief, the fear, the desire, the love. The whole messy pile of being human.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">We spend so much time trying to heal it, release it, get over it, rise above it.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">But what if we could use it?</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">What if all of that stuff was raw material?</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">That’s the strange magic of transmutation.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">You don’t have to erase your history or become some purified, perfected version of yourself. You learn how to take what’s already here and work with it.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">You make gold out of dirt.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">So here’s something to think about:</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">What’s your dirt?</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">What are you carrying around that you wish you weren’t?</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">The grief. The anger. The disappointment. The fear. The thing that still pisses you off. The thing you wish had never happened. The part of yourself you keep trying to change, hide, heal, forgive, forget.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">Now imagine you didn’t have to throw any of it away.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">Imagine you could take all of that energy and transmute it into something else.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">What would you make?</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">What would your anger become?<br>What could you create from your grief?<br>Where could all that energy go if it weren’t trapped in the same old story?</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">You don’t need to have the answer.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">Just start noticing the raw material.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">That’s where transmutation begins.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">That idea is at the heart of the practices in your Goddess Embodiment Guide, and eventually it became the foundation of everything I create at Tarot Flower.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">XOXO,<br>Vanessa</p><p style="font-size:13px"><a style="color:#6f553a" href="{{unsubscribe_url}}">Unsubscribe</a></p></td></tr></table></td></tr></table></body></html>','Hey, Goddess,

Have you ever wondered what you’re supposed to do with all the crazy shit that happens to you?

The heartbreaks. The wrong turns. The things you didn’t choose. The things you did choose and wish you hadn’t. The anger, the grief, the fear, the desire, the love. The whole messy pile of being human.

We spend so much time trying to heal it, release it, get over it, rise above it.

But what if we could use it?

What if all of that stuff was raw material?

That’s the strange magic of transmutation.

You don’t have to erase your history or become some purified, perfected version of yourself. You learn how to take what’s already here and work with it.

You make gold out of dirt.

So here’s something to think about:

What’s your dirt?

What are you carrying around that you wish you weren’t?

The grief. The anger. The disappointment. The fear. The thing that still pisses you off. The thing you wish had never happened. The part of yourself you keep trying to change, hide, heal, forgive, forget.

Now imagine you didn’t have to throw any of it away.

Imagine you could take all of that energy and transmute it into something else.

What would you make?

What would your anger become?
What could you create from your grief?
Where could all that energy go if it weren’t trapped in the same old story?

You don’t need to have the answer.

Just start noticing the raw material.

That’s where transmutation begins.

That idea is at the heart of the practices in your Goddess Embodiment Guide, and eventually it became the foundation of everything I create at Tarot Flower.

XOXO,
Vanessa

Unsubscribe: {{unsubscribe_url}}','sequence' FROM email_sequences WHERE slug='goddess-guide-welcome' ON CONFLICT(sequence_id,slug) DO UPDATE SET title=excluded.title,description=excluded.description,delay_hours=excluded.delay_hours,status='active',subject=excluded.subject,html_template=excluded.html_template,text_template=excluded.text_template,email_type=excluded.email_type,updated_at=CURRENT_TIMESTAMP;
INSERT INTO email_sequence_steps(id,sequence_id,step_order,slug,title,description,delay_hours,status,subject,html_template,text_template,email_type) SELECT 'tf-suite-sacred-becoming-oracle-introduction',id,3,'sacred-becoming-oracle-introduction','That thing you keep dreaming about...','Approved Tarot Flower email',168,'active','That thing you keep dreaming about...','<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#121113;font-family:Georgia,serif;color:#211c19"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" style="max-width:620px;background:#f3ead9;border:1px solid #9b773c"><tr><td style="padding:24px;background:#181416;color:#c5a15c;text-align:center;font:12px Arial;letter-spacing:.2em">TAROT FLOWER</td></tr><tr><td style="padding:32px 24px"><p style="margin:0 0 20px;font-size:17px;line-height:1.7">Hey, Goddess,</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">You know that thing you keep thinking about?</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">The idea. The project. The adventure. The change you want to make.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">And then there’s all the other stuff.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">The grief. The rage. The fear. The disappointment. The things that happened. The things that didn’t. All that energy we carry around with us every day.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">What if you could learn how to use it?</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">What if grief could become creation?</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">Rage could become power?</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">Loss could become possibility?</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">What if the things that have shaped you could become fuel for what you want to create next?</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">That’s transmutation. And it’s something you can practice.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">That’s why I created Step Into Your Fire.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">FIRE is a 45-minute guided ritual where we release what’s ready to go, choose what we want to create, and learn to move that energy through ritual, movement, music, and embodiment.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">We burn what’s ready to go. And then we decide what we’re going to do with the fire.</p><p style="margin:26px 0"><a href="https://tarotflower.com/step-into-your-fire/" style="display:inline-block;padding:14px 22px;border:1px solid #a17d47;background:#211c19;color:#f3ead9;text-decoration:none;font:13px Arial;letter-spacing:.08em">STEP INTO YOUR FIRE</a></p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">And if you’re curious about where this practice is growing next, the Sacred Becoming Oracle Deck is coming soon. It puts the framework behind these practices into your hands, so you can begin creating your own magic.</p><p style="margin:26px 0"><a href="https://tarotflower.com/sacred-becoming/oracle-deck/#oracle-waitlist" style="display:inline-block;padding:14px 22px;border:1px solid #a17d47;background:#211c19;color:#f3ead9;text-decoration:none;font:13px Arial;letter-spacing:.08em">JOIN THE ORACLE LIST</a></p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">XOXO,<br>Vanessa</p><p style="font-size:13px"><a style="color:#6f553a" href="{{unsubscribe_url}}">Unsubscribe</a></p></td></tr></table></td></tr></table></body></html>','Hey, Goddess,

You know that thing you keep thinking about?

The idea. The project. The adventure. The change you want to make.

And then there’s all the other stuff.

The grief. The rage. The fear. The disappointment. The things that happened. The things that didn’t. All that energy we carry around with us every day.

What if you could learn how to use it?

What if grief could become creation?

Rage could become power?

Loss could become possibility?

What if the things that have shaped you could become fuel for what you want to create next?

That’s transmutation. And it’s something you can practice.

That’s why I created Step Into Your Fire.

FIRE is a complete 45-minute guided ritual where we release what’s ready to go, choose what we want to create, and learn to move that energy through ritual, movement, music, and embodiment.

We burn what’s ready to go. And then we decide what we’re going to do with the fire.

STEP INTO YOUR FIRE
https://tarotflower.com/step-into-your-fire/

And if you’re curious about where this practice is growing next, the Sacred Becoming Oracle Deck is coming soon. It puts the framework behind these practices into your hands, so you can begin creating your own magic.

JOIN THE ORACLE LIST
https://tarotflower.com/sacred-becoming/oracle-deck/#oracle-waitlist

XOXO,
Vanessa

Unsubscribe: {{unsubscribe_url}}','sequence' FROM email_sequences WHERE slug='goddess-guide-welcome' ON CONFLICT(sequence_id,slug) DO UPDATE SET title=excluded.title,description=excluded.description,delay_hours=excluded.delay_hours,status='active',subject=excluded.subject,html_template=excluded.html_template,text_template=excluded.text_template,email_type=excluded.email_type,updated_at=CURRENT_TIMESTAMP;
INSERT INTO email_sequence_steps(id,sequence_id,step_order,slug,title,description,delay_hours,status,subject,html_template,text_template,email_type) SELECT 'tf-suite-oracle-confirmation',id,1,'oracle-confirmation','Welcome to the spiral ✨','Approved Tarot Flower email',0,'active','Welcome to the spiral ✨','<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#121113;font-family:Georgia,serif;color:#211c19"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" style="max-width:620px;background:#f3ead9;border:1px solid #9b773c"><tr><td style="padding:24px;background:#181416;color:#c5a15c;text-align:center;font:12px Arial;letter-spacing:.2em">TAROT FLOWER</td></tr><tr><td style="padding:32px 24px"><p style="margin:0 0 20px;font-size:17px;line-height:1.7">Hey, Goddess,</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">Let me tell you why I made these cards. Because I know this deck can be transformative for you, just as it was for me.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">There was a time when almost everything I thought made me me disappeared.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">My home. My children. My identity. The life I thought I was living.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">I didn’t know how to get back to who I had been. Eventually, I realized I wasn’t supposed to.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">I was becoming someone new.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">Ritual, Tarot, music, movement, embodiment and the Goddess became ways of working with everything that remained. The grief. The rage. The love. The desire. The memories. The parts of myself I was rediscovering.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">Instead of trying to leave it all behind, I began to work with it.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">That is where Sacred Becoming came from.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">The cards grew out of that journey. Before they became a deck, they were my companions through the spiral of transmutation: destruction and creation, surrender and sovereignty, loss and emergence.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">Because becoming isn’t linear.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">We move in a spiral.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">The Sacred Becoming Oracle is a 36-card system built around Earth, Water, Fire, Air and Aether, designed to help you move through your own thresholds of transformation.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">Most oracle decks give you messages. Sacred Becoming gives you a practice.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">The deck already exists. Now I’m preparing to bring the physical deck into the world, and by joining this list, you’ll be among the first to know when it’s ready.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">I’m so happy you’re here.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">XOXO,<br>Vanessa</p><p style="font-size:13px"><a style="color:#6f553a" href="{{unsubscribe_url}}">Unsubscribe</a></p></td></tr></table></td></tr></table></body></html>','Hey, Goddess,

Let me tell you why I made these cards. Because I know this deck can be transformative for you, just as it was for me.

There was a time when almost everything I thought made me me disappeared.

My home. My children. My identity. The life I thought I was living.

I didn’t know how to get back to who I had been. Eventually, I realized I wasn’t supposed to.

I was becoming someone new.

Ritual, Tarot, music, movement, embodiment and the Goddess became ways of working with everything that remained. The grief. The rage. The love. The desire. The memories. The parts of myself I was rediscovering.

Instead of trying to leave it all behind, I began to work with it.

That is where Sacred Becoming came from.

The cards grew out of that journey. Before they became a deck, they were my companions through the spiral of transmutation: destruction and creation, surrender and sovereignty, loss and emergence.

Because becoming isn’t linear.

We move in a spiral.

The Sacred Becoming Oracle is a 36-card system built around Earth, Water, Fire, Air and Aether, designed to help you move through your own thresholds of transformation.

Most oracle decks give you messages. Sacred Becoming gives you a practice.

The deck already exists. Now I’m preparing to bring the physical deck into the world, and by joining this list, you’ll be among the first to know when it’s ready.

I’m so happy you’re here.

XOXO,
Vanessa

Unsubscribe: {{unsubscribe_url}}','welcome' FROM email_sequences WHERE slug='oracle-waitlist-welcome' ON CONFLICT(sequence_id,slug) DO UPDATE SET title=excluded.title,description=excluded.description,delay_hours=excluded.delay_hours,status='active',subject=excluded.subject,html_template=excluded.html_template,text_template=excluded.text_template,email_type=excluded.email_type,updated_at=CURRENT_TIMESTAMP;
INSERT INTO email_sequence_steps(id,sequence_id,step_order,slug,title,description,delay_hours,status,subject,html_template,text_template,email_type) SELECT 'tf-suite-newsletter-welcome',id,1,'newsletter-welcome','Something magical is growing... ✨','Approved Tarot Flower email',0,'active','Something magical is growing... ✨','<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#121113;font-family:Georgia,serif;color:#211c19"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" style="max-width:620px;background:#f3ead9;border:1px solid #9b773c"><tr><td style="padding:24px;background:#181416;color:#c5a15c;text-align:center;font:12px Arial;letter-spacing:.2em">TAROT FLOWER</td></tr><tr><td style="padding:32px 24px"><p style="margin:0 0 20px;font-size:17px;line-height:1.7">Hey, Goddess,</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">There’s a lot happening at Tarot Flower right now.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">New rituals. New music. The Sacred Becoming Oracle Deck. Workshops and gatherings. New ways to practice together. And a few ideas that are still just tiny sparks waiting to become something.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">(A grimoire, anyone?)</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">We’re building a whole world here.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">A place to practice the magic. To create together. Gather in real life. Follow our curiosity. Go on adventures. And see what happens when all of these strange and beautiful threads begin weaving together.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">And now you’re part of it.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">I’ll keep you close to everything that’s unfolding: new creations, invitations, gatherings, rituals, and whatever magical little doors open next.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">I’m really excited to see what we grow together.</p><p style="margin:0 0 20px;font-size:17px;line-height:1.7">XOXO,<br>Vanessa</p><p style="font-size:13px"><a style="color:#6f553a" href="{{unsubscribe_url}}">Unsubscribe</a></p></td></tr></table></td></tr></table></body></html>','Hey, Goddess,

There’s a lot happening at Tarot Flower right now.

New rituals. New music. The Sacred Becoming Oracle Deck. Workshops and gatherings. New ways to practice together. And a few ideas that are still just tiny sparks waiting to become something.

(A grimoire, anyone?)

We’re building a whole world here.

A place to practice the magic. To create together. Gather in real life. Follow our curiosity. Go on adventures. And see what happens when all of these strange and beautiful threads begin weaving together.

And now you’re part of it.

I’ll keep you close to everything that’s unfolding: new creations, invitations, gatherings, rituals, and whatever magical little doors open next.

I’m really excited to see what we grow together.

XOXO,
Vanessa

Unsubscribe: {{unsubscribe_url}}','welcome' FROM email_sequences WHERE slug='tarot-newsletter-welcome' ON CONFLICT(sequence_id,slug) DO UPDATE SET title=excluded.title,description=excluded.description,delay_hours=excluded.delay_hours,status='active',subject=excluded.subject,html_template=excluded.html_template,text_template=excluded.text_template,email_type=excluded.email_type,updated_at=CURRENT_TIMESTAMP;
