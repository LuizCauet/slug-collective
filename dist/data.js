export const albums = [
 ['Charm','Clairo'],['Blonde','Frank Ocean'],['Two Star & the Dream Police','Mk.gee'],['Imaginal Disk','Magdalena Bay'],['Submarine','The Marías'],['Negro Swan','Blood Orange'],['In Rainbows','Radiohead'],['SOS','SZA'],['BUBBA','KAYTRANADA'],['Heaven or Las Vegas','Cocteau Twins'],['Lahai','Sampha'],['When I Get Home','Solange']
].map(([title,artist],id)=>({id,title,artist,art:`assets/album-${id}.svg`}));
const rows = [
 ['Maya Chen','she/her','Porter','Probably making a playlist for a very specific walk. Ask me about my favorite bassline.',[0,4,5],['Photography','Design'],'Shoot a show, make a zine, see what happens.','After the encore','A photo study of a fictional campus show.'],
 ['Jordan Ellis','they/them','Kresge','Guitar pedals, foggy mornings, and songs that take their time.',[2,6,9],['Guitar','Production'],'Looking for a voice for some dreamy guitar sketches.','Fog machine','An imaginary late-night guitar project.'],
 ['Sofia Reyes','she/her','Rachel Carson','Big headphones, tiny sketchbook. Always down to trade albums.',[1,7,11],['Vocals','Songwriting'],'A low-pressure writing session with a producer.','Blue hour','A fictional collection of voice-note ideas.'],
 ['Kai Brooks','he/him','Oakes','Making beats between classes. Usually a little late to the function.',[8,5,10],['Production','DJ'],'Vocalists and anyone who wants to build a set.','Room 204','A fictional beat tape in progress.'],
 ['Amara Okafor','she/they','Merrill','Collecting sounds and little moments. More of a full-album person.',[10,11,1],['Film','Photography'],'Music videos with people who like experimenting.','Soft focus','An imaginary short-film moodboard.'],
 ['Leo Park','he/they','Cowell','Will talk about synths for longer than you asked.',[3,2,8],['Production','Keys'],'Someone to get weird with synths.','Signals','A fictional electronic project.'],
 ['Nico Flores','they/them','Stevenson','Posters, records, and every show I can get to.',[5,0,11],['Design','Illustration'],'Cover art for your next release.','Sleeve notes','A fictional cover-art collection.'],
 ['Isabel Cruz','she/her','College Nine','Singing quietly until someone hands me a mic.',[4,0,7],['Vocals','Guitar'],'Casual jams, maybe a little indie band?','Window seat','An imaginary bedroom-pop demo.'],
 ['Ethan Wu','he/him','Crown','Drums first. Everything else later. Let’s make some noise.',[6,2,9],['Drums'],'A band, a jam, literally any excuse to play.',null,null],
 ['Zoe Martin','she/they','Porter','I make little worlds out of moving pictures.',[9,3,4],['Film','Design'],'Visuals for live sets and music videos.','Night swimming','A fictional visual treatment.'],
 ['Ravi Shah','he/him','Oakes','Soul records and Sunday cooking. Learning bass one groove at a time.',[10,8,5],['Bass','Songwriting'],'A rhythm section and some good company.',null,null],
 ['Jules Nguyen','they/them','Kresge','Currently romanticizing the walk back from the library.',[1,0,3],['Writing','Photography'],'Zines, lyrics, or something we haven’t thought of.','Margin notes','A fictional poetry-zine concept.']
];
export const members=rows.map((r,id)=>({id,name:r[0],pronouns:r[1],college:r[2],bio:r[3],albums:r[4],roles:r[5],intent:r[6],work:r[7],workDescription:r[8],avatar:`assets/avatar-${id}.svg`}));
export const roles=[...new Set(members.flatMap(m=>m.roles))].sort();
