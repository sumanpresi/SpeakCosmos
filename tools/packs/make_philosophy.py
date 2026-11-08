import json, re
T = 1762700000000
SC = '/tmp/claude-0/-home-claude/d9e205ea-bb05-5bd1-b9cf-8a2ffb968137/scratchpad/'
P = "phil"
topics = [
 dict(id="ph-self", label="Self, image and habits", color="#b5651d", desc="Fame, apology, Osho, meditation, daily habits and how the speaker thinks about himself", parent=P),
 dict(id="ph-ai", label="Mind, AI and machines", color="#2a7fb8", desc="Memory, AI tools, quantum computing, deepfakes, robots and the risks of every new technology", parent=P),
 dict(id="ph-home", label="Parenting and marriage", color="#c2185b", desc="Lighthouse parenting, respect at home, marriage and family", parent=P),
 dict(id="ph-youth", label="Youth, society and pressure", color="#6a4c93", desc="Generations, suicide as a social fact, social media, labelling and humility", parent=P),
 dict(id="ph-caste", label="Caste census and reservation", color="#3d7a2a", desc="Why the caste census matters, its history, sub-categories and creamy-layer ideas", parent=P),
 dict(id="ph-belief", label="Belief, astrology and reason", color="#c9a227", desc="Agnosticism, induction and deduction, astrology, placebo and magic", parent=P),
]
S_, A_, H_, Y_, C_, B_ = "ph-self", "ph-ai", "ph-home", "ph-youth", "ph-caste", "ph-belief"
N = []
def n(topic, key, title, text): N.append(dict(id="ph-" + key, topic=topic, title=title, text=text))

# ---- self ----
n(S_,"s01","Image bigger than the person","The speaker says recognition is pleasant but brings anxiety: privacy goes, someone always seems to be watching, and you feel pushed to look the way people expect. He calls it a trap that grows with your image. (≈0:01:35–0:04:33) Leads to [[You cannot satisfy everyone]].")
n(S_,"s02","You cannot satisfy everyone","Society gave him respect, so a little humiliation hurts, yet some people will always be angry. He says family, colleagues and rest keep him steady, and that he can bear criticism when he knows he was not wrong. (≈0:04:33–0:06:01) See [[Apologise when you are wrong]].")
n(S_,"s03","Apologise when you are wrong","The interviewer says the hardest thing is to apologise. The speaker holds that if you are wrong you should say so, but that he stands by what he said in the Sita clip, while apologising to everyone who was hurt. (≈0:06:01–0:07:34 and 0:07:34–0:09:05) Context in [[Clips lose the last sentence]].")
n(S_,"s04","Clips lose the last sentence","He says the viral clip left out the sentence that these views belong to the poets, not to Ram, and that a classroom talk meant for UPSC became public with no context. (≈0:07:34–0:09:05) Compare [[Social media never forgets]].")
n(S_,"s05","Basements, drills and safety","On the institute accident he says the building had seven exits and was in a commercial mall, but he accepts an accident can happen in ways nobody imagined. Basements are now closed to classes and firefighters run drills with students. (≈0:07:34–0:10:34) See [[Apologise when you are wrong]].")
n(S_,"s06","Staying off social media","He left Twitter seven years ago and says Facebook and Twitter swallow an hour that could go to books, films or family. His Instagram is run by his team, who press him to post a photo every two or three months. (≈0:10:34–0:13:35)")
n(S_,"s07","Osho as the turning point","At 17, on a month-long government water-audit project in what is now Chhattisgarh, he read the Osho books he had carried. He calls Osho the turning point from a non-academic reader to someone with academic curiosity. (≈1:04:34–1:07:34) Next: [[Take the best, no chains]].")
n(S_,"s08","Take the best, no chains","After Osho he asked questions of everyone, including RSS-linked hostel mates and leftist friends, and concluded no ideology is complete. He then read most Western philosophers, sociology and literature. (≈1:06:00–1:09:04) See [[Osho and the many meditations]].")
n(S_,"s09","Osho and the many meditations","He compares dynamic meditation, Sudarshan Kriya, Nada Brahma and Vipassana, and likens suppressed anger to soda in a corked bottle. He cites neuroscience (EEG, functional MRI) that meditation improves attention and memory. He says he has only practised pranayama lately. (≈1:07:34–1:13:33)")
n(S_,"s10","Time, sleep and fitness","He sleeps late (about 1 a.m. to 8:30 a.m.), spends about two hours daily on strength, yoga and pranayama, and walks a lot. He says vegetarians in India often get too little protein and that muscles and bones weaken after 60. His office has about 2,000 staff and he is stepping back from the CEO role. (≈1:13:33–1:18:04) See [[Me time, notes and the smart ring]].")
n(S_,"s11","Me time, notes and the smart ring","He keeps two hours of 'me time' at night for reading, poetry and notes, with thousands of notes and ideas for about 1,000 films on his phone. A smart ring shows he is relaxed 60 to 70 percent of the time. (≈1:18:04–1:21:01)")
n(S_,"s12","Put yourself in their shoes","Philosophy and psychology taught him to see an angry person's side: a son resented his father's crooked walk until he wore his shoes and felt the nail the father endured to save money. He says most fights end when you stand on the other side. (≈1:21:01–1:24:05)")
n(S_,"s13","Rarely angry","In 10 to 20 years he cannot recall scolding a staff member. When salaries were once delayed by a bank error, he only ordered that no one in finance leaves until all staff are paid. (≈1:22:34–1:24:05) See [[Put yourself in their shoes]].")
n(S_,"s14","Take risks, jump","He has skydived and paraglided and says he is comfortable with risk. Quoting Osho's 'jump into the unknown', he says the biggest risk is taking none, because anything good comes only with some risk. (≈1:51:03–1:52:31)")
n(S_,"s15","Saints, vampires and the 90 percent","Using Freud as he explains him, he says about 90 percent of people sit between good and bad, 5 percent are saints and 5 percent vampires, in every field including civil service and journalism. (≈2:22:34–2:25:31) Compare [[Humble because of hardship]].")
n(S_,"s16","Mantra and the image gap","His mantra: if nothing happens, there will be experience. He wants the gap between his image and himself to be as small as possible and says an artist's worst failing is to lie for praise. (≈2:52:31–2:55:36) Echoes [[Image bigger than the person]].")

# ---- AI ----
n(A_,"a01","Memory versus smart devices","He asks whether the test of remembering tables to 20 still matters. For his son a calculator or phone is enough, and the brain keeps what it finds important. He admits memory improves with practice and worries about small losses like an OTP. (≈0:16:33–0:27:02) See [[Relevance versus jobs]].")
n(A_,"a02","Relevance versus jobs","He separates relevance from jobs: lakhs and crores of jobs may go and new ones appear, as with computers, but AI is riskier. His advice is to go with a new technology, not avoid it. (≈0:27:02–0:30:00) Next: [[AI as a reading assistant]].")
n(A_,"a03","AI as a reading assistant","He asks AI for the ten best books on a subject and a 5,000-word summary in Hindi with examples, by voice, and says he almost does not need to read whole books now. (≈0:30:00–0:33:02) See [[Deep research in minutes]].")
n(A_,"a04","A bedtime story from a chatbot","A two-year-old who thought ghosts were hats got a voice-AI story to ease her fear, ending with 'Tuppy' repeated three times; the child loved it. (≈0:30:00–0:31:32)")
n(A_,"a05","Deep research in minutes","His 1999 PhD took two years of finding books; now deep-search mode reads many websites and can fetch the original 1902 Kolhapur notification and make comparison charts in seconds. (≈0:31:32–0:36:02) Compare [[A podcast from your own notes]].")
n(A_,"a06","A podcast from your own notes","He uploads an SOP document to a notebook-type AI tool and has it turned into a two-voice podcast, then explains how the interviewer can ask AI what questions were not asked before. (≈0:36:02–0:39:05)")
n(A_,"a07","AI and medical advice","He relays stories of a woman whose chatbot told her to call an ambulance for stomach pain and a friend whose test reports gave the same advice as the doctor. He warns it lacks personal attention, but says India has few doctors. These are secondhand stories. (≈0:37:35–0:42:02) Next: [[Quantum computing and medicine]].")
n(A_,"a08","Quantum computing and medicine","He describes simulated testing on digital human models and Google's quantum chip that, as he says, does in minutes what the best supercomputer needs ten thousand years for. He expects customised medicines in 15 to 20 years. Treat the figures as his. (≈0:42:02–0:46:32) See [[GPUs and Nvidia]].")
n(A_,"a09","GPUs and Nvidia","He says whoever has the most GPUs leads in AI, that Nvidia became the world's largest company, and that the US restricts GPU sales to China. (≈0:43:30–0:45:01) Leads to [[India behind in AI]].")
n(A_,"a10","India behind in AI","He says India is far behind, has a fund and is trying to build a GPU, while China leads along with the US and Gulf countries are investing. He says every country has to try. (≈0:45:01–0:46:32)")
n(A_,"a11","Deepfakes and digital arrest","He shows a team-made video of himself that is not him and warns of voice cloning, fake photos and the 'digital arrest' scams that target elders. He calls this a transition period when crime rises. (≈0:46:32–0:51:00) See [[AI and creativity]].")
n(A_,"a12","AI and creativity","AI makes paintings, music, logos and scripts, and he says it can remix many spy novels into a new one with changed names. He thinks it threatens the less creative first. (≈0:51:00–0:54:00) Next: [[Railway engine and technology risk]].")
n(A_,"a13","Railway engine and technology risk","He compares AI to a railway engine: useful, but deadly if you stand in front of it. Planes and space flight cost lives too, yet we kept going. He says mathematics and algorithms fall first and philosophy takes longer. (≈0:52:31–0:55:33) See [[Humanoid robot teachers]].")
n(A_,"a14","Humanoid robot teachers","He imagines humanoid robots with lab-grown skin, AI and long-life batteries teaching maths in every village school, in any language, and not tired. The interviewer answers that books and the page-turning feeling have an emotional touch. (≈0:55:33–0:58:35)")
n(A_,"a15","Loving our devices","He notes people personalise phones with skins and photos and expects the same affection for household robots; his family's cleaning robots have names. (≈0:58:35–1:00:05) Compare [[Humanoid robot teachers]].")

# ---- home ----
n(H_,"h01","The hammer story","His young son once hit his knee with a hammer while trying to be a carpenter. He joked instead of scolding, and the son remembers that he did not make him feel wrong. (≈1:24:05–1:25:33)")
n(H_,"h02","Lighthouse parenting","He rejects helicopter parenting (hovering) and neglect. Lighthouse parenting shines a light and does not judge the ship's route: suggestions, not orders. His 18-plus son still consults them. (≈1:27:04–1:30:06) Compare [[Respect is non-negotiable]].")
n(H_,"h03","Respect is non-negotiable","He and his brothers did chores as children; his son needed fewer survival skills because the family was secure, but the unwritten rule at home is that he touches the feet of the driver, guard and cook each morning. He also notes parents who feed children in front of tablets. (≈1:28:30–1:31:32)")
n(H_,"h04","Friends with my son","He is closer to a friend than a disciplinarian and was strict only a few times. Once a teacher complained about his son and the other child; he says he apologised but that boys who never fight will not grow up. (≈1:31:32–1:34:30) See [[Lighthouse parenting]].")
n(H_,"h05","I was no angel either","He says what he did in sixth grade his son does in eighth, and he cannot expect an angel. Still, he is glad the benchmark is a little higher than his. (≈1:34:30–1:36:00)")
n(H_,"h06","Marriage between two personalities","He says a couple that claims perfect understanding is lying: in the past wives gave up their personalities and so marriages looked stable. Today two equal people will clash, and his own marriage began when both were young, with their ideas not yet formed. (≈2:13:36–2:18:06)")
n(H_,"h07","Shared tastes and healthy differences","A marriage works better when hobbies, food and travel overlap, but some difference is needed too. A sign of trouble is when someone says they are bored with the spouse. (≈2:18:06–2:21:06) Compare [[Marriage between two personalities]].")

# ---- youth ----
n(Y_,"y01","Every generation praises its own","He quotes Premchand: the pleasures of the past and the sorrow of the present belong to every generation, and every generation thinks the next is ruined. He thinks today's youth are smart. (≈0:13:35–0:18:05)")
n(Y_,"y02","Kids less prejudiced than us","He says children in good city schools are less casteist, sexist and communal than his generation, whose prejudices sit in the subconscious. They are global in values. (≈0:19:30–0:24:02) See [[Every generation praises its own]].")
n(Y_,"y03","Boys and girls can be friends","In his school boys and girls were kept apart and friendship across the line was awkward; today's children manage it better. (≈0:16:33–0:18:05)")
n(Y_,"y04","Suicide as a social fact","He cites Durkheim's study of 26,000 suicides to say suicide is not only individual or psychological: rates are stable in each city and differ by marriage and religion. Mental health is one factor, not the whole story. (≈1:36:00–1:39:04) Next: [[Coping with the losers' side]].")
n(Y_,"y05","Coping with the losers' side","Of millions who sit exams only a few thousand succeed; the real question is how people cope with not succeeding. Biology, parental history and upbringing all play a part. (≈1:37:32–1:40:34)")
n(Y_,"y06","Protected children, fragile adults","A 17-year-old who was once a working adult is now treated as a child. He says protected children never get the chance to wrestle with life and so cope less well. (≈1:39:04–1:42:07)")
n(Y_,"y07","Social media never forgets","Earlier an insult in a field ended with a few slaps; now a dislike or screenshot is visible to the world, permanent and spreading. Bullying is recorded. (≈1:42:07–1:43:32) See [[Labelling and the thief in all of us]].")
n(Y_,"y08","Labelling and the thief in all of us","Labelling theory warns that a child tagged a thief stays one. He asks 500 students who never stole anything and says the only difference is who got caught. (≈1:43:32–1:45:03)")
n(Y_,"y09","Followers, likes and real friends","He recalls an influencer under pressure to reach a million followers. He says real friends are three or four, plus a few family members, and fake followers will not help in a crisis. (≈1:45:03–1:46:33)")
n(Y_,"y10","The phone as a double-edged sword","Children need phones for assignments, yet phones hide passwords and secrets. He says parents need training as well. (≈1:46:33–1:48:03) Compare [[Lighthouse parenting]].")
n(Y_,"y11","Humble because of hardship","He says those who come up through hardship are often humble and the proud ones are few in every field, from civil service to cinema. (≈2:19:37–2:22:34) See [[Saints, vampires and the 90 percent]].")
n(Y_,"y12","How civil service changed","He says power once held by the collector has been split by the Criminal Procedure Code, Panchayati Raj and local bodies. About 5 percent in any field are very honest. (≈2:22:34–2:25:31)")
n(Y_,"y13","Why long videos work","His long videos get tens of millions of views, so he thinks most viewers are not UPSC aspirants. He cites comments from a pregnant woman and a mother whose child quietens at his voice. (≈2:28:33–2:31:31)")

# ---- caste ----
n(C_,"c01","Why a caste census","He compares a check-up: a census is a body scan. Without data on caste, religion, poverty and jobs you cannot make good policy. He says the government's decision was right even if forced. (≈2:31:31–2:34:35) Next: [[Centre versus state: census or survey]].")
n(C_,"c02","Centre versus state: census or survey","Census is a Union subject (Seventh Schedule, entry 69) and states ran surveys instead. Justice Khanna's bench let the state go ahead with its Bihar survey. (≈2:33:01–2:36:04) See [[Why a caste census]].")
n(C_,"c03","Caste politics against religion politics","He says the Congress believes caste politics answers religious politics, while the BJP resisted until the OBC vote, about 60 percent of the population, forced a change. (≈2:34:35–2:36:04)")
n(C_,"c04","A short history of the caste count","The Kalelkar commission (1953) recommended a caste count in 1961 but Nehru did not act. The SECC of 2011 data was never fully released. (≈2:36:04–2:37:32) Compare [[Kolhapur 1902 and Mysore]].")
n(C_,"c05","Kolhapur 1902 and Mysore","In 1902 Kolhapur reserved half the seats for non-Brahmins after data showed Brahmins were 3 percent of the population and 60 percent of the administration. Mysore's 1911 census led to a committee and a 25 percent quota. (≈2:37:32–2:39:04)")
n(C_,"c06","Sub-categories within OBC and SC","Rohini Commission's report on OBC sub-groups is not public. He notes that the Supreme Court allowed sub-classification for SC and ST in 2024, reversing the 2005 Chinnaiah ruling. Details are as he states them. (≈2:39:04–2:40:36) See [[Why a caste census]].")
n(C_,"c07","Caste among Muslims","He says state surveys show that around 80 percent of Muslims fall under OBC and that caste exists among Muslims and Christians too. Diagnosis comes before treatment. (≈2:40:36–2:42:00)")
n(C_,"c08","Reservation for one generation","He says he supports reservation fully but wants the same family not to keep benefiting: once a person reaches a senior post, their child should move aside for others. (≈2:42:00–2:43:33) Compare [[Why a caste census]].")

# ---- belief ----
n(B_,"b01","Agnosticism","He says if you believe, do not claim to know; if you do not, do not claim either. He calls this agnosticism and cites Kant for the idea that no one knows. (≈1:54:04–1:55:30) Next: [[Religion in practice]].")
n(B_,"b02","Religion in practice","He does not worship himself and says he sits in family prayers out of respect for his wife's faith. (≈1:55:30–1:57:03)")
n(B_,"b03","Curious about astrology","He says astrology is not provably true, but he is not saying it is totally wrong. He wants to study it properly and compares it with medicine, which also works on statistics of many people. (≈1:57:03–1:58:33) See [[Astrology is induction]].")
n(B_,"b04","Induction and deduction","Philosophy has two kinds of reasoning: induction (from many observed cases) and deduction (from a general statement). (≈1:58:33–2:00:05) Used in [[Astrology is induction]].")
n(B_,"b05","Astrology is induction","He guesses astrology grew from centuries of noted cases linking planetary positions at birth to later events. That gives estimates, not certainty, and old records were not objective. These are his suppositions. (≈2:00:05–2:01:31) See [[Induction and deduction]].")
n(B_,"b06","The Narlikar challenge","As the speaker tells it, scientist Narlikar challenged astrologers to test their predictions objectively and none took part. The name is garbled in the transcript. (≈2:01:31–2:03:07)")
n(B_,"b07","Right once, wrong once","He has met astrologers who were astonishingly accurate and others whose predictions failed. A friend in the IAS was told he would rank in the top ten, which he did not. He sees both as chance. (≈2:03:07–2:04:31)")
n(B_,"b08","Placebo and the light switch","He calls astrology a placebo: a child thinks pressing a button is magic until they learn the connection between the electrons and the bulb. A miracle lasts only until there is a scientific explanation. (≈2:04:31–2:06:08)")
n(B_,"b09","The monkey and the mirror","A monkey in front of a mirror thinks another monkey lives behind it and fights. Without understanding the mechanism it is a miracle. (≈2:06:08–2:07:32) See [[Placebo and the light switch]].")
n(B_,"b10","Magic and mentalism as art","He says he learned the tricks and that nobody can read minds or open a phone password. Magic is a beautiful art, like Suhani's, not divine intervention, and videos are edited. (≈2:06:08–2:10:34)")

# check links
title = {x["title"] for x in N}
bad = set()
for x in N:
    for l in re.findall(r"\[\[([^\]]+)\]\]", x["text"]):
        if l not in title: bad.add((x["id"], l))
print("unresolved:", sorted(bad))
dup = {}
for x in N: dup.setdefault(x["title"], []).append(x["id"])
print("shared titles:", {k: v for k, v in dup.items() if len(v) > 1})
for i, x in enumerate(N):
    x["created"] = T + i * 1000; x["updated"] = T + i * 1000
for t in topics:
    t["created"] = T; t["updated"] = T
pack = dict(v=1, topics=topics, notes=N, bridges=[], dismissed=[], cols=[], gone={})
json.dump(pack, open('/home/claude/speakcosmos/assets/pack-philosophy-talk.json', 'w'), ensure_ascii=False, indent=1)
print(len(N), sum(len(x['text']) for x in N))
rows = json.load(open(SC + 'ph_rows.json'))
json.dump(rows, open('/home/claude/speakcosmos/assets/res/philtalk.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print("rows", len(rows))
