// ── Islamic Plugin — AA MD Bot ──────────────────────────────
// All duas, zikr, hadiths, kalimas, adhkar, and Jaffery menu

const BANNER = '🕌 *AA MD Bot — Islamic Commands* 🤲';

const DUAS = {
  dua_forgiveness: {
    title: '🤲 Dua for Forgiveness',
    arabic: 'رَبَّنَا ظَلَمْنَا أَنفُسَنَا وَإِن لَّمْ تَغْفِرْ لَنَا وَتَرْحَمْنَا لَنَكُونَنَّ مِنَ الْخَاسِرِينَ',
    translation: '"Our Lord, we have wronged ourselves, and if You do not forgive us and have mercy upon us, we will surely be among the losers."',
    ref: '(Quran 7:23)',
  },
  dua_rizq: {
    title: '💚 Dua for Rizq (Provision)',
    arabic: 'اللَّهُمَّ اكْفِنِي بِحَلَالِكَ عَنْ حَرَامِكَ وَأَغْنِنِي بِفَضْلِكَ عَمَّنْ سِوَاكَ',
    translation: '"O Allah, suffice me with Your lawful against Your prohibited, and make me independent of all others besides You."',
    ref: '(Tirmidhi 3563)',
  },
  dua_guidance: {
    title: '🌟 Dua for Guidance',
    arabic: 'اللَّهُمَّ اهْدِنَا فِيمَنْ هَدَيْتَ',
    translation: '"O Allah, guide us among those whom You have guided."',
    ref: '(Tirmidhi)',
  },
  dua_health: {
    title: '💊 Dua for Good Health',
    arabic: 'اللَّهُمَّ عَافِنِي فِي بَدَنِي، اللَّهُمَّ عَافِنِي فِي سَمْعِي وَبَصَرِي',
    translation: '"O Allah, grant me health in my body. O Allah, grant me health in my hearing and sight."',
    ref: '(Abu Dawud 5090)',
  },
  dua_morning: {
    title: '🌅 Morning Dua',
    arabic: 'أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ وَالْحَمْدُ لِلَّهِ',
    translation: '"We have entered the morning and the entire dominion belongs to Allah, and all praise is for Allah."',
    ref: '(Abu Dawud)',
  },
  dua_evening: {
    title: '🌙 Evening Dua',
    arabic: 'أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ وَالْحَمْدُ لِلَّهِ',
    translation: '"We have entered the evening and the entire dominion belongs to Allah, and all praise is for Allah."',
    ref: '(Abu Dawud)',
  },
  dua_sleep: {
    title: '😴 Dua Before Sleep',
    arabic: 'بِاسْمِكَ اللَّهُمَّ أَمُوتُ وَأَحْيَا',
    translation: '"In Your name, O Allah, I die and I live."',
    ref: '(Bukhari 6324)',
  },
  dua_travel: {
    title: '✈️ Dua for Travel',
    arabic: 'سُبْحَانَ الَّذِي سَخَّرَ لَنَا هَذَا وَمَا كُنَّا لَهُ مُقْرِنِينَ',
    translation: '"Glory be to Him Who has subjected this to us, and we could never have it (by our efforts)."',
    ref: '(Quran 43:13)',
  },
  dua_food: {
    title: '🍽️ Dua Before Eating',
    arabic: 'بِسْمِ اللهِ وَعَلَى بَرَكَةِ اللهِ',
    translation: '"In the name of Allah and with the blessings of Allah."',
    ref: '(Ibn Majah)',
  },
  dua_after_food: {
    title: '🙏 Dua After Eating',
    arabic: 'الْحَمْدُ لِلَّهِ الَّذِي أَطْعَمَنَا وَسَقَانَا وَجَعَلَنَا مُسْلِمِينَ',
    translation: '"All praise is for Allah Who has fed us and given us drink, and made us Muslims."',
    ref: '(Abu Dawud)',
  },
  dua_exam: {
    title: '📚 Dua for Studies & Exam',
    arabic: 'رَبِّ زِدْنِي عِلْمًا',
    translation: '"My Lord, increase me in knowledge."',
    ref: '(Quran 20:114)',
  },
  dua_anxiety: {
    title: '💆 Dua for Anxiety & Stress',
    arabic: 'حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ',
    translation: '"Allah is sufficient for us, and He is the best Guardian."',
    ref: '(Quran 3:173)',
  },
  dua_parents: {
    title: '👨‍👩‍👦 Dua for Parents',
    arabic: 'رَّبِّ ارْحَمْهُمَا كَمَا رَبَّيَانِي صَغِيرًا',
    translation: '"My Lord, have mercy upon them as they brought me up when I was small."',
    ref: '(Quran 17:24)',
  },
};

const ZIKR = {
  zikr_astaghfirullah: {
    title: '💜 Astaghfirullah',
    arabic: 'أَسْتَغْفِرُ اللهَ',
    translation: 'I seek forgiveness from Allah',
    note: 'Recite 100 times daily to cleanse sins and open the doors of rizq.',
  },
  zikr_alhamdulillah: {
    title: '💚 Alhamdulillah',
    arabic: 'الْحَمْدُ لِلَّهِ',
    translation: 'All praise is for Allah',
    note: 'Fills the scales of good deeds. (Muslim 223)',
  },
  zikr_subhanallah: {
    title: '🌸 SubhanAllah',
    arabic: 'سُبْحَانَ اللهِ',
    translation: 'Glory be to Allah',
    note: 'Planting a tree in Jannah with every recitation. (Tirmidhi)',
  },
  zikr_allahuakbar: {
    title: '🏆 Allahu Akbar',
    arabic: 'اللَّهُ أَكْبَرُ',
    translation: 'Allah is the Greatest',
    note: 'Most beloved words to Allah after SubhanAllah & Alhamdulillah.',
  },
  zikr_lailahaillallah: {
    title: '☪️ La Ilaha Illallah',
    arabic: 'لَا إِلَهَ إِلَّا اللَّهُ',
    translation: 'There is no god but Allah',
    note: 'Best dhikr. Whoever says this with sincerity enters Jannah.',
  },
  zikr_lahawla: {
    title: '🌀 La Hawla Wa La Quwwata',
    arabic: 'لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ',
    translation: 'There is no power and no strength except with Allah',
    note: 'A treasure from the treasures of Jannah. (Bukhari 4205)',
  },
  zikr_bismillah: {
    title: '🌟 Bismillah',
    arabic: 'بِسْمِ اللهِ الرَّحْمٰنِ الرَّحِيْمِ',
    translation: 'In the name of Allah, the Most Gracious, the Most Merciful',
    note: 'Begin every action with Bismillah for blessings.',
  },
  zikr_hasbunallah: {
    title: '🛡️ Hasbunallah',
    arabic: 'حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ',
    translation: 'Allah is sufficient for us, and He is the best Guardian',
    note: 'Dua of Ibrahim ع & Prophet ﷺ. (Quran 3:173)',
  },
};

const HADITHS = {
  hadith_good_morals: {
    title: '😊 Hadith — Good Morals',
    text: '"The best among you are those who have the best manners and character." — Prophet Muhammad ﷺ',
    ref: '(Bukhari 3559)',
  },
  hadith_cleanliness: {
    title: '🧹 Hadith — Cleanliness',
    text: '"Cleanliness is half of faith." — Prophet Muhammad ﷺ',
    ref: '(Muslim 223)',
  },
  hadith_truth: {
    title: '✅ Hadith — Truth',
    text: '"Truthfulness leads to righteousness and righteousness leads to Jannah." — Prophet Muhammad ﷺ',
    ref: '(Bukhari 6094)',
  },
  hadith_patience: {
    title: '⏳ Hadith — Patience (Sabr)',
    text: '"No fatigue, nor disease, nor sorrow, nor sadness, nor hurt, nor distress befalls a Muslim... but that Allah expiates some of his sins for that." — Prophet Muhammad ﷺ',
    ref: '(Bukhari 5641)',
  },
  hadith_smile: {
    title: '😄 Hadith — Smiling is Sadaqah',
    text: '"Your smile for your brother is a charity." — Prophet Muhammad ﷺ',
    ref: '(Tirmidhi 1956)',
  },
  hadith_knowledge: {
    title: '📖 Hadith — Seeking Knowledge',
    text: '"Seeking knowledge is an obligation upon every Muslim." — Prophet Muhammad ﷺ',
    ref: '(Ibn Majah 224)',
  },
  hadith_neighbour: {
    title: '🏠 Hadith — Good Neighbour',
    text: '"Whoever believes in Allah and the Last Day, let him be good to his neighbour." — Prophet Muhammad ﷺ',
    ref: '(Muslim 47)',
  },
};

const KALIMAS = {
  kalima_tayyiba: {
    title: '☪️ 1st Kalima — Tayyiba (The Pure Word)',
    arabic: 'لَا إِلَهَ إِلَّا اللَّهُ مُحَمَّدٌ رَّسُولُ اللَّهِ',
    translation: 'There is no god but Allah, Muhammad is the Messenger of Allah.',
  },
  kalima_shahadat: {
    title: '📜 2nd Kalima — Shahadat (Testimony)',
    arabic: 'أَشْهَدُ أَنْ لَّا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ وَأَشْهَدُ أَنَّ مُحَمَّدًا عَبْدُهُ وَرَسُولُهُ',
    translation: 'I bear witness that there is none worthy of worship except Allah, alone, without partner, and I bear witness that Muhammad is His servant and Messenger.',
  },
  kalima_tamjeed: {
    title: '🌟 3rd Kalima — Tamjeed (Glorification)',
    arabic: 'سُبْحَانَ اللهِ وَالْحَمْدُ لِلَّهِ وَلَا إِلَهَ إِلَّا اللَّهُ وَاللَّهُ أَكْبَرُ وَلَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللهِ الْعَلِيِّ الْعَظِيمِ',
    translation: 'Glory be to Allah. All praise is for Allah. There is none worthy of worship except Allah. Allah is the Greatest. There is no power and no strength except from Allah, the Most High, the Most Great.',
  },
  kalima_tauheed: {
    title: '🕌 4th Kalima — Tauheed (Oneness)',
    arabic: 'لَا إِلَهَ إِلَّا اللهُ وَحْدَهُ لَا شَرِيكَ لَهُ لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ يُحْيِي وَيُمِيتُ بِيَدِهِ الْخَيْرُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ',
    translation: 'There is none worthy of worship except Allah. He is alone. He has no partner. His is the Kingdom, and for Him is all praise. He gives life and causes death. In His hand is all good, and He has power over everything.',
  },
  kalima_astaghfar: {
    title: '🙏 5th Kalima — Astaghfar (Seeking Forgiveness)',
    arabic: 'أَسْتَغْفِرُ اللهَ رَبِّي مِنْ كُلِّ ذَنْبٍ أَذْنَبْتُهُ عَمَدًا أَوْ خَطَأً سِرًّا أَوْ عَلَانِيَةً وَأَتُوبُ إِلَيْهِ',
    translation: 'I seek forgiveness from Allah, my Lord, from every sin I committed, intentionally or by mistake, secretly or openly, and I repent towards Him.',
  },
  kalima_radde_kufr: {
    title: '🛡️ 6th Kalima — Radde Kufr (Rejection of Disbelief)',
    arabic: 'اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنْ أَنْ أُشْرِكَ بِكَ شَيْئًا وَأَنَا أَعْلَمُ بِهِ وَأَسْتَغْفِرُكَ لِمَا لَا أَعْلَمُ بِهِ',
    translation: 'O Allah, I seek refuge in You from associating anything with You knowingly, and I seek Your forgiveness for that which I do unknowingly.',
  },
};

const JAFFERY = {
  jaffery_menu: {
    title: '🌹 Fikra-e-Jaffery — Ahl al-Bayt ع Menu',
    text:
      `🌹 *Fikra-e-Jaffery — Ahl al-Bayt ع*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🤲 *Duas (Special)*\n` +
      `• .dua_kumayl — Dua Kumayl (Imam Ali ع)\n` +
      `• .dua_arafah — Dua Imam Husain ع (Arafah)\n` +
      `• .dua_tawassul — Dua Tawassul\n` +
      `• .dua_imam_zaman — Dua for Imam Mahdi ع\n` +
      `• .dua_nudba — Dua Nudba\n` +
      `• .dua_sabah — Dua Sabah (Imam Ali ع)\n` +
      `• .dua_joshan — Dua Joshan Kabeer\n\n` +
      `📿 *Ziyarat*\n` +
      `• .ziyarat_ashura — Ziyarat Ashura (Imam Husain ع)\n` +
      `• .ziyarat_warith — Ziyarat Warith\n` +
      `• .ziyarat_imam_ali — Ziyarat Imam Ali ع\n` +
      `• .ziyarat_imam_raza — Ziyarat Imam Raza ع\n\n` +
      `💚 *Salawat*\n` +
      `• .salawat_aal — Salawat Aal-e-Muhammad\n` +
      `• .salawat_shaban — Salawat e Shabaniyya\n\n` +
      `📜 *14 Masoomeen ع*\n` +
      `• .masoomeen14 — Names & short info of all 14\n\n` +
      `🕌 *Other*\n` +
      `• .karbala_info — Event of Karbala details\n` +
      `• .nahjul_balagha — Quote from Nahjul Balagha\n` +
      `• .ghadeer_info — Event of Ghadeer Khum\n`,
  },
  dua_kumayl: {
    title: '🤲 Dua Kumayl — Imam Ali ع',
    text:
      `*Dua Kumayl — Imam Ali ibn Abi Talib ع*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `بِسْمِ اللهِ الرَّحْمٰنِ الرَّحِيمِ\n\n` +
      `اللَّهُمَّ إِنِّي أَسْأَلُكَ بِرَحْمَتِكَ الَّتِي وَسِعَتْ كُلَّ شَيْءٍ\n` +
      `وَبِقُوَّتِكَ الَّتِي قَهَرْتَ بِهَا كُلَّ شَيْءٍ\n\n` +
      `_"O Allah, I ask You by Your mercy which encompasses all things, and by Your power by which You dominate all things..."_\n\n` +
      `📌 _Recite every Thursday night. Taught by Imam Ali ع to Kumayl ibn Ziyad._\n` +
      `📖 _Source: Mafatih al-Jinan_`,
  },
  dua_arafah: {
    title: '🌟 Dua Arafah — Imam Husain ع',
    text:
      `*Dua Arafah — Imam Husain ibn Ali ع*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `اللَّهُمَّ أَنَا الْفَقِيرُ فِي غِنَايَ فَكَيْفَ لَا أَكُونُ فَقِيرًا فِي فَقْرِي\n\n` +
      `_"O Allah, I am poor even in my richness — how then shall I not be poor in my poverty?"_\n\n` +
      `📌 _Recited by Imam Husain ع on the Day of Arafah (9th Dhul Hijja)._\n` +
      `📖 _Source: Mafatih al-Jinan_`,
  },
  dua_tawassul: {
    title: '🌹 Dua Tawassul',
    text:
      `*Dua Tawassul — Through the Ahlul Bayt ع*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `يَا مُحَمَّدُ يَا عَلِيُّ يَا عَلِيُّ يَا مُحَمَّدُ\n` +
      `اِكْفِيَانِي فَإِنَّكُمَا كَافِيَايَ\n\n` +
      `_"O Muhammad, O Ali, O Ali, O Muhammad — suffice me, for indeed you two are my sufficiency."_\n\n` +
      `📌 _Recite for intercession through the Prophet ﷺ and Ahl al-Bayt ع._\n` +
      `📖 _Source: Mafatih al-Jinan_`,
  },
  dua_imam_zaman: {
    title: '⚡ Dua for Imam Mahdi ع',
    text:
      `*Dua for Imam al-Mahdi (atf) — Our Living Imam*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `اللَّهُمَّ كُنْ لِوَلِيِّكَ الْحُجَّةِ بْنِ الْحَسَنِ صَلَوَاتُكَ عَلَيْهِ وَعَلَى آبَائِهِ\n` +
      `فِي هَذِهِ السَّاعَةِ وَفِي كُلِّ سَاعَةٍ وَلِيًّا وَحَافِظًا وَقَائِدًا وَنَاصِرًا وَدَلِيلًا وَعَيْنًا\n` +
      `حَتَّى تُسْكِنَهُ أَرْضَكَ طَوْعًا وَتُمَتِّعَهُ فِيهَا طَوِيلًا\n\n` +
      `_"O Allah, be for Your wali (guardian), the Hujja son of Hasan, Your blessings upon him and his forefathers, in this hour and every hour, a guardian, protector, leader, helper, proof, and eye, until You make him dwell on Your earth willingly and grant him long enjoyment therein."_\n\n` +
      `📌 _Recite every day for the safety of Imam Mahdi ع and hastening his reappearance._`,
  },
  dua_nudba: {
    title: '💧 Dua Nudba',
    text:
      `*Dua Nudba — The Lament for Imam Mahdi ع*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `أَيْنَ الطَّالِبُ بِذُحُولِ الْأَنْبِيَاءِ وَأَبْنَاءِ الْأَنْبِيَاءِ\n\n` +
      `_"Where is he who seeks retribution for the bloodshed of the prophets and sons of prophets?"_\n\n` +
      `📌 _Recited on Fridays, Eid days, and Ghadir. Expressing longing for Imam Mahdi ع._\n` +
      `📖 _Source: Mafatih al-Jinan_`,
  },
  dua_sabah: {
    title: '🌄 Dua Sabah — Imam Ali ع',
    text:
      `*Dua Sabah — Morning Supplication of Imam Ali ع*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `يَا مَنْ دَلَعَ لِسَانَ الصَّبَاحِ بِنُطْقِ تَبَلُّجِهِ\n\n` +
      `_"O the One Who allowed the tongue of morning to speak with the clarity of its brightness..."_\n\n` +
      `📌 _Recite every morning. A comprehensive praise of Allah's attributes._\n` +
      `📖 _Source: Mafatih al-Jinan_`,
  },
  dua_joshan: {
    title: '🌙 Dua Joshan Kabeer',
    text:
      `*Dua Joshan al-Kabeer*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `يَا اللهُ يَا رَحْمَانُ يَا رَحِيمُ يَا كَرِيمُ يَا مُقِيمُ\n\n` +
      `_"O Allah, O Rahman, O Rahim, O Generous, O Sustainer..."_\n\n` +
      `📌 _1000 names of Allah — revealed to Prophet Muhammad ﷺ via Jibreel ع. Recite in Ramadan nights and Laylatul Qadr._\n` +
      `📖 _Source: Mafatih al-Jinan_`,
  },
  ziyarat_ashura: {
    title: '🌹 Ziyarat Ashura — Imam Husain ع',
    text:
      `*Ziyarat Ashura — Imam Husain ibn Ali ع*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `السَّلَامُ عَلَيْكَ يَا أَبَا عَبْدِ اللهِ\n` +
      `السَّلَامُ عَلَيْكَ يَا ابْنَ رَسُولِ اللهِ\n\n` +
      `_"Peace be upon you, O Aba Abdillah. Peace be upon you, O son of the Messenger of Allah."_\n\n` +
      `📌 _Recite especially on 10th Muharram (Ashura). Narrated to bring great reward and intercession._\n` +
      `📖 _Source: Kamil al-Ziyarat, Mafatih al-Jinan_`,
  },
  ziyarat_warith: {
    title: '🕊️ Ziyarat Warith',
    text:
      `*Ziyarat Warith — Imam Husain ع*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `السَّلَامُ عَلَيْكَ يَا وَارِثَ آدَمَ صَفِيِّ اللهِ\n` +
      `السَّلَامُ عَلَيْكَ يَا وَارِثَ نُوحٍ نَبِيِّ اللهِ\n\n` +
      `_"Peace be upon you, O heir of Adam, the chosen of Allah. Peace be upon you, O heir of Nuh, the Prophet of Allah..."_\n\n` +
      `📌 _Recite when visiting or sending salutations to Imam Husain ع._`,
  },
  ziyarat_imam_ali: {
    title: '⚔️ Ziyarat Imam Ali ع — Najaf',
    text:
      `*Ziyarat Imam Ali ibn Abi Talib ع*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `السَّلَامُ عَلَيْكَ يَا أَمِيرَ الْمُؤْمِنِينَ\n` +
      `السَّلَامُ عَلَيْكَ يَا وَصِيَّ رَسُولِ رَبِّ الْعَالَمِينَ\n\n` +
      `_"Peace be upon you, O Commander of the Faithful. Peace be upon you, O vicegerent of the Messenger of the Lord of the Worlds."_\n\n` +
      `📌 _Recite facing Najaf al-Ashraf (Iraq) — tomb of Imam Ali ع._`,
  },
  ziyarat_imam_raza: {
    title: '🌹 Ziyarat Imam Raza ع — Mashhad',
    text:
      `*Ziyarat Imam Ali ibn Musa al-Raza ع*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `السَّلَامُ عَلَيْكَ يَا عَلِيَّ بْنَ مُوسَى الرِّضَا\n` +
      `أَيُّهَا الرَّضِيُّ الْمُرْتَضَى\n\n` +
      `_"Peace be upon you, O Ali son of Musa al-Raza — the one who is pleased and with whom Allah is pleased."_\n\n` +
      `📌 _Recite facing Mashhad (Iran) — tomb of Imam Raza ع, 8th Imam._`,
  },
  salawat_aal: {
    title: '💚 Salawat Aal-e-Muhammad',
    arabic: 'اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَآلِ مُحَمَّدٍ',
    translation: '"O Allah, send blessings upon Muhammad and the family of Muhammad."',
    note: 'Recite as often as possible — especially in prayers and at the end of duas. Prophet ﷺ said: "Do not send incomplete salawat upon me."',
  },
  salawat_shaban: {
    title: '🌙 Salawat e Shabaniyya',
    text:
      `*Salawat e Shabaniyya — Supplication of Sha\'ban*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَآلِ مُحَمَّدٍ شَجَرَةِ النُّبُوَّةِ\n\n` +
      `_"O Allah, send blessings upon Muhammad and the family of Muhammad — the tree of Prophethood..."_\n\n` +
      `📌 _Recited in the month of Sha\'ban, especially by Imam Ali Zainul Abideen ع._`,
  },
  masoomeen14: {
    title: '📜 14 Masoomeen ع — The Infallibles',
    text:
      `*14 Masoomeen ع — Ahl al-Bayt of the Prophet ﷺ*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `1️⃣ Prophet Muhammad ﷺ (570–632 CE) — Seal of Prophets\n` +
      `2️⃣ Hazrat Fatima Zahra س (605–632 CE) — Lady of Paradise\n` +
      `3️⃣ Imam Ali ع (600–661 CE) — Commander of the Faithful\n` +
      `4️⃣ Imam Hasan ع (625–670 CE) — The Peaceful\n` +
      `5️⃣ Imam Husain ع (626–680 CE) — Chief of Martyrs, Karbala\n` +
      `6️⃣ Imam Ali Zainul Abideen ع (658–713 CE) — The Worshipper\n` +
      `7️⃣ Imam Muhammad Baqir ع (676–733 CE) — The Splitter of Knowledge\n` +
      `8️⃣ Imam Jafar Sadiq ع (702–765 CE) — The Truthful\n` +
      `9️⃣ Imam Musa Kazim ع (744–799 CE) — The Patient\n` +
      `🔟 Imam Ali Raza ع (765–818 CE) — The Pleased One\n` +
      `1️⃣1️⃣ Imam Muhammad Taqi ع (810–835 CE) — The Pious\n` +
      `1️⃣2️⃣ Imam Ali Hadi ع (827–868 CE) — The Guide\n` +
      `1️⃣3️⃣ Imam Hasan Askari ع (846–874 CE) — The Military\n` +
      `1️⃣4️⃣ Imam Muhammad Mahdi ع (869–present) — Our Living Imam\n\n` +
      `📌 _All 14 are sinless, infallible (masum), and divinely guided leaders._\n\n` +
      `اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَآلِ مُحَمَّدٍ`,
  },
  karbala_info: {
    title: '⚔️ The Event of Karbala',
    text:
      `*The Tragedy of Karbala — 10 Muharram 61 AH (680 CE)*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📍 *Location:* Karbala, Iraq\n` +
      `👑 *Leader:* Imam Husain ibn Ali ع (Grandson of Prophet ﷺ)\n` +
      `⚔️ *Enemy:* Army of Yazid ibn Muawiyah (30,000+ soldiers)\n` +
      `🕯️ *Martyrs:* 72 companions of Imam Husain ع\n\n` +
      `📖 *Summary:*\n` +
      `Imam Husain ع refused to pledge allegiance to the corrupt ruler Yazid. He rose up for justice and truth, sacrificing his life, family, and companions. His sister Hazrat Zainab س carried the message of Karbala forward.\n\n` +
      `💬 *Famous Quote:*\n` +
      `_"Death with dignity is better than life in humiliation."_ — Imam Husain ع\n\n` +
      `🕌 *Legacy:* Every year, billions mourn on Ashura (10th Muharram).\n` +
      `📿 _Recite Salawat for the souls of the martyrs._`,
  },
  nahjul_balagha: {
    title: '📚 Nahjul Balagha — Imam Ali ع',
    text:
      `*Quote from Nahjul Balagha — Imam Ali ع*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `_"Do not be a slave of others when Allah has created you free."_\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `_"The tongue is like a lion; if you let it loose, it devours you."_\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `_"Knowledge is a shield, truth is might, ignorance is a disgrace, understanding is glory, generosity is success."_\n\n` +
      `📖 _Nahjul Balagha — Compiled by Sharif Radi (10th century). Sermons, letters, and aphorisms of Imam Ali ع._`,
  },
  ghadeer_info: {
    title: '🌊 Event of Ghadeer Khum',
    text:
      `*Ghadeer Khum — 18 Dhul Hijja, 10 AH (632 CE)*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📍 *Location:* Ghadir Khum, Arabia (near Juhfah)\n` +
      `👥 *Witnesses:* 100,000+ Hajj pilgrims\n\n` +
      `📖 *The Announcement:*\n` +
      `After his final Hajj, Prophet Muhammad ﷺ stopped the entire caravan and declared:\n\n` +
      `_"Whoever I am his master (mawla), Ali is also his master. O Allah, befriend those who befriend him and be enemy to those who are enemy to him."_\n\n` +
      `🕌 *Significance:* This event is recognized as the appointment of Imam Ali ع as the rightful successor of the Prophet ﷺ.\n\n` +
      `📿 *Eid al-Ghadeer:* Celebrated on 18 Dhul Hijja — the greatest Eid.\n` +
      `اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَآلِ مُحَمَّدٍ`,
  },
};

function formatDua(d) {
  return `${d.title}\n━━━━━━━━━━━━━━━━━━━━\n\n🔤 *Arabic:*\n${d.arabic}\n\n📖 *Translation:*\n${d.translation}\n\n${d.ref || ''}`;
}
function formatZikr(z) {
  return `${z.title}\n━━━━━━━━━━━━━━━━━━━━\n\n🔤 *Arabic:*\n${z.arabic}\n\n📖 *Meaning:*\n${z.translation}\n\n💡 ${z.note}`;
}
function formatHadith(h) {
  return `${h.title}\n━━━━━━━━━━━━━━━━━━━━\n\n📜 ${h.text}\n\n📖 ${h.ref}`;
}
function formatKalima(k) {
  return `${k.title}\n━━━━━━━━━━━━━━━━━━━━\n\n🔤 *Arabic:*\n${k.arabic}\n\n📖 *Translation:*\n${k.translation}`;
}
function formatSalawat(s) {
  if (s.arabic) {
    return `${s.title}\n━━━━━━━━━━━━━━━━━━━━\n\n🔤 *Arabic:*\n${s.arabic}\n\n📖 *Translation:*\n${s.translation}\n\n💡 ${s.note}`;
  }
  return `${s.title}\n━━━━━━━━━━━━━━━━━━━━\n\n${s.text}`;
}

// ── Islamic Menu ─────────────────────────────────────────────
export const islamicMenu = {
  command: 'duas_menu',
  alias: ['duas', 'dmenu'],
  description: 'Static Islamic content index (duas, zikr, hadith, kalimas)',
  category: 'islamic',
  async execute({ reply }) {
    reply(
      `${BANNER}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🤲 *DUAS*\n` +
      `.dua_forgiveness · .dua_rizq · .dua_guidance · .dua_health\n` +
      `.dua_morning · .dua_evening · .dua_sleep · .dua_travel\n` +
      `.dua_food · .dua_after_food · .dua_exam · .dua_anxiety · .dua_parents\n\n` +
      `📿 *ZIKR*\n` +
      `.zikr_astaghfirullah · .zikr_alhamdulillah · .zikr_subhanallah\n` +
      `.zikr_allahuakbar · .zikr_lailahaillallah · .zikr_lahawla\n` +
      `.zikr_bismillah · .zikr_hasbunallah\n\n` +
      `📜 *HADITHS*\n` +
      `.hadith_good_morals · .hadith_cleanliness · .hadith_truth\n` +
      `.hadith_patience · .hadith_smile · .hadith_knowledge · .hadith_neighbour\n\n` +
      `☪️ *6 KALIMAS*\n` +
      `.kalima_tayyiba · .kalima_shahadat · .kalima_tamjeed\n` +
      `.kalima_tauheed · .kalima_astaghfar · .kalima_radde_kufr\n\n` +
      `💚 *SPECIALS*\n` +
      `.darood_sharif · .morning_adhkar · .evening_adhkar\n` +
      `.asmaul_husna · .islam_fact · .quran_reminder · .prayers_info\n\n` +
      `🌹 *FIKRA-E-JAFFERY (Ahl al-Bayt ع)*\n` +
      `.jaffery_menu — Full Jaffery menu\n` +
      `.dua_kumayl · .dua_arafah · .dua_tawassul · .dua_imam_zaman\n` +
      `.dua_nudba · .dua_sabah · .dua_joshan\n` +
      `.ziyarat_ashura · .ziyarat_warith · .ziyarat_imam_ali · .ziyarat_imam_raza\n` +
      `.salawat_aal · .salawat_shaban · .masoomeen14\n` +
      `.karbala_info · .nahjul_balagha · .ghadeer_info`
    );
  },
};

// ── Darood / Adhkar ───────────────────────────────────────────
export const daroodSharif = {
  command: 'darood_sharif',
  alias: ['darood', 'durood'],
  description: 'Durood Ibrahim (Full)',
  category: 'islamic',
  async execute({ reply }) {
    reply(
      `💚 *Durood Ibrahim*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🔤 *Arabic:*\n` +
      `اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ\n` +
      `كَمَا صَلَّيْتَ عَلَى إِبْرَاهِيمَ وَعَلَى آلِ إِبْرَاهِيمَ\n` +
      `إِنَّكَ حَمِيدٌ مَجِيدٌ\n\n` +
      `اللَّهُمَّ بَارِكْ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ\n` +
      `كَمَا بَارَكْتَ عَلَى إِبْرَاهِيمَ وَعَلَى آلِ إِبْرَاهِيمَ\n` +
      `إِنَّكَ حَمِيدٌ مَجِيدٌ\n\n` +
      `📖 *Translation:*\n` +
      `"O Allah, send your blessings on Muhammad and his family as You sent blessings on Ibrahim and his family. Verily You are Praiseworthy, Glorious. O Allah, bless Muhammad and his family as You blessed Ibrahim and his family. Verily You are Praiseworthy, Glorious."\n\n` +
      `💡 _Recite at least 10 times a day, especially on Fridays._`
    );
  },
};

export const morningAdhkar = {
  command: 'morning_adhkar',
  alias: ['morning', 'adhkar_sabah'],
  description: 'Morning Adhkar from Sunnah',
  category: 'islamic',
  async execute({ reply }) {
    reply(
      `🌅 *Morning Adhkar (Azkar al-Sabah)*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
      `1️⃣ أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ\n` +
      `_"We have entered the morning and the kingdom belongs to Allah."_ (3x)\n\n` +
      `2️⃣ اللَّهُمَّ بِكَ أَصْبَحْنَا\n` +
      `_"O Allah, by You we enter the morning."_ (1x)\n\n` +
      `3️⃣ سُبْحَانَ اللهِ وَبِحَمْدِهِ — 100x\n` +
      `_"Glory and praise be to Allah."_\n\n` +
      `4️⃣ أَعُوذُ بِاللهِ مِنَ الشَّيْطَانِ الرَّجِيمِ\n` +
      `_"I seek refuge in Allah from the accursed Shaytan."_\n\n` +
      `5️⃣ آيَةُ الْكُرْسِيِّ — Ayatul Kursi (1x)\n\n` +
      `6️⃣ قُلْ هُوَ اللَّهُ أَحَدٌ — Surah Ikhlas (3x)\n` +
      `+ Surah Falaq (3x) + Surah Nas (3x)\n\n` +
      `📖 _Source: Fortress of the Muslim (Hisnul Muslim)_`
    );
  },
};

export const eveningAdhkar = {
  command: 'evening_adhkar',
  alias: ['evening', 'adhkar_masa'],
  description: 'Evening Adhkar from Sunnah',
  category: 'islamic',
  async execute({ reply }) {
    reply(
      `🌙 *Evening Adhkar (Azkar al-Masa)*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
      `1️⃣ أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ\n` +
      `_"We have entered the evening and the kingdom belongs to Allah."_ (3x)\n\n` +
      `2️⃣ اللَّهُمَّ بِكَ أَمْسَيْنَا\n` +
      `_"O Allah, by You we enter the evening."_ (1x)\n\n` +
      `3️⃣ سُبْحَانَ اللهِ وَبِحَمْدِهِ — 100x\n` +
      `_"Glory and praise be to Allah."_\n\n` +
      `4️⃣ آيَةُ الْكُرْسِيِّ — Ayatul Kursi (1x)\n` +
      `_Protection from evil until morning._\n\n` +
      `5️⃣ قُلْ هُوَ اللَّهُ أَحَدٌ — Surah Ikhlas (3x)\n` +
      `+ Surah Falaq (3x) + Surah Nas (3x)\n\n` +
      `6️⃣ أَعُوذُ بِكَلِمَاتِ اللهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ — (3x)\n` +
      `_"I seek refuge in the perfect words of Allah from the evil of what He has created."_\n\n` +
      `📖 _Source: Fortress of the Muslim (Hisnul Muslim)_`
    );
  },
};

export const asmaul_husna = {
  command: 'asmaul_husna',
  alias: ['99names', 'allahnames'],
  description: '99 Names of Allah (Asmaul Husna)',
  category: 'islamic',
  async execute({ reply }) {
    reply(
      `🌟 *Asmaul Husna — 99 Names of Allah*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
      `1. الرَّحْمَنُ — Ar-Rahman (The Beneficent)\n` +
      `2. الرَّحِيمُ — Ar-Raheem (The Merciful)\n` +
      `3. الْمَلِكُ — Al-Malik (The King)\n` +
      `4. الْقُدُّوسُ — Al-Quddus (The Holy)\n` +
      `5. السَّلَامُ — As-Salam (The Source of Peace)\n` +
      `6. الْمُؤْمِنُ — Al-Mu'min (The Guardian of Faith)\n` +
      `7. الْمُهَيْمِنُ — Al-Muhaymin (The Protector)\n` +
      `8. الْعَزِيزُ — Al-Aziz (The Almighty)\n` +
      `9. الْجَبَّارُ — Al-Jabbar (The Compeller)\n` +
      `10. الْمُتَكَبِّرُ — Al-Mutakabbir (The Greatest)\n\n` +
      `... and 89 more beautiful names.\n\n` +
      `📖 _"And to Allah belong the best names, so invoke Him by them."_ (Quran 7:180)\n\n` +
      `💡 _Memorize them — whoever memorizes all 99 names enters Jannah. (Bukhari 2736)_`
    );
  },
};

export const islamFact = {
  command: 'islam_fact',
  alias: ['islamicfact', 'fact_islam'],
  description: 'Random Islamic fact',
  category: 'islamic',
  async execute({ reply }) {
    const facts = [
      'The word "Islam" means peace and submission to the will of Allah.',
      'The Quran was revealed over a period of 23 years to Prophet Muhammad ﷺ.',
      'Zamzam water has been flowing for over 4,000 years and has never dried up.',
      'The Adhan (call to prayer) is recited in the ear of newborn babies.',
      'Friday (Jumu\'ah) is the most blessed day of the week in Islam.',
      'The Ka\'bah in Makkah is the first house of worship built for mankind.',
      'Surah Al-Fatiha is recited at least 17 times a day in the 5 daily prayers.',
      'Prophet Muhammad ﷺ was illiterate (ummi) yet the Quran is the most eloquent Arabic text.',
      'The night of Laylatul Qadr is better than 1000 months (83+ years).',
      '"Insha\'Allah" means "If Allah wills" — Muslims say it for future plans.',
    ];
    const fact = facts[Math.floor(Math.random() * facts.length)];
    reply(`🌟 *Random Islamic Fact*\n━━━━━━━━━━━━━━━━━━━━\n\n💡 ${fact}`);
  },
};

export const quranReminder = {
  command: 'quran_reminder',
  alias: ['daily_ayah'],
  description: 'Daily Quran reminder / Ayah',
  category: 'islamic',
  async execute({ reply }) {
    const ayahs = [
      { text: '"Indeed, with hardship will be ease."', ref: 'Quran 94:6' },
      { text: '"And He is with you wherever you are."', ref: 'Quran 57:4' },
      { text: '"Verily, Allah is with the patient."', ref: 'Quran 2:153' },
      { text: '"So remember Me; I will remember you."', ref: 'Quran 2:152' },
      { text: '"Allah does not burden a soul beyond that it can bear."', ref: 'Quran 2:286' },
      { text: '"And whoever puts his trust in Allah, then He will suffice him."', ref: 'Quran 65:3' },
      { text: '"Indeed, the help of Allah is near."', ref: 'Quran 2:214' },
      { text: '"Call upon Me; I will respond to you."', ref: 'Quran 40:60' },
    ];
    const ayah = ayahs[Math.floor(Math.random() * ayahs.length)];
    reply(`📖 *Daily Quran Reminder*\n━━━━━━━━━━━━━━━━━━━━\n\n_${ayah.text}_\n\n📌 *(${ayah.ref})*`);
  },
};

export const prayersInfo = {
  command: 'prayers_info',
  alias: ['salah', 'namaz_info', '5prayers'],
  description: '5 Daily Prayers info',
  category: 'islamic',
  async execute({ reply }) {
    reply(
      `🕌 *5 Daily Prayers (Salah)*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
      `1️⃣ *Fajr* — Dawn (2 Sunnah + 2 Fardh = 4 total)\n` +
      `2️⃣ *Dhuhr* — Midday (4 Sunnah + 4 Fardh + 2 Sunnah = 10 total)\n` +
      `3️⃣ *Asr* — Afternoon (4 Fardh = 4 total)\n` +
      `4️⃣ *Maghrib* — Sunset (3 Fardh + 2 Sunnah = 5 total)\n` +
      `5️⃣ *Isha* — Night (4 Fardh + 2 Sunnah + 3 Witr = 9 total)\n\n` +
      `📖 _"Indeed, prayer has been decreed upon the believers a decree of specified times."_\n*(Quran 4:103)*\n\n` +
      `💡 _Total daily rakah: 32-40 depending on Sunnah/Nafl._`
    );
  },
};

// ── Build command map ─────────────────────────────────────────
const allPlugins = [];

// Duas
for (const [cmd, data] of Object.entries(DUAS)) {
  allPlugins.push({
    command: cmd,
    description: data.title,
    category: 'islamic',
    async execute({ reply }) { reply(formatDua(data)); },
  });
}

// Zikr
for (const [cmd, data] of Object.entries(ZIKR)) {
  allPlugins.push({
    command: cmd,
    description: data.title,
    category: 'islamic',
    async execute({ reply }) { reply(formatZikr(data)); },
  });
}

// Hadiths
for (const [cmd, data] of Object.entries(HADITHS)) {
  allPlugins.push({
    command: cmd,
    description: data.title,
    category: 'islamic',
    async execute({ reply }) { reply(formatHadith(data)); },
  });
}

// Kalimas
for (const [cmd, data] of Object.entries(KALIMAS)) {
  allPlugins.push({
    command: cmd,
    description: data.title,
    category: 'islamic',
    async execute({ reply }) { reply(formatKalima(data)); },
  });
}

// Jaffery commands
for (const [cmd, data] of Object.entries(JAFFERY)) {
  allPlugins.push({
    command: cmd,
    description: data.title,
    category: 'islamic',
    async execute({ reply }) {
      if (data.text) reply(data.text);
      else if (data.arabic) reply(formatSalawat(data));
      else reply(data.title);
    },
  });
}

// Named exports for loader
allPlugins.push(islamicMenu, daroodSharif, morningAdhkar, eveningAdhkar, asmaul_husna, islamFact, quranReminder, prayersInfo);

export default allPlugins;
