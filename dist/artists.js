// Sample member tastes, not a streaming catalog or a claim about UCSC listeners.
export const normalizeArtist=name=>name.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en');
export const artistLists=[
 ['Clairo','feeble little horse','Wednesday','Faye Webster','julie'],
 ['Mk.gee','Dijon','janet','They Are Gutting a Body of Water','Duster'],
 ['SZA','Liv.e','Cleo Sol','Nourished by Time','keiyaA'],
 ['KAYTRANADA','454','George Clanton','Dean Blunt','Vegyn'],
 ['Sampha','Tirzah','Mica Levi','Kelsey Lu','Liv.e'],
 ['Magdalena Bay','underscores','Jane Remover','Iglooghost','quinn'],
 ['Blood Orange','Dean Blunt','bar italia','Double Virgo','Nourished by Time'],
 ['The Marías','Crumb','Men I Trust','Luna Li','julie'],
 ['Radiohead','Duster','Unwound','Grouper','They Are Gutting a Body of Water'],
 ['Cocteau Twins','Grouper','yeule','Eartheater','Tirzah'],
 ['Sampha','Yussef Dayes','Nala Sinephro','Cleo Sol','HOMESHAKE'],
 ['Frank Ocean','feeble little horse','Adrianne Lenker','Florist','Wednesday']
];
const albumArtists=[['Clairo','The Marías','Blood Orange'],['Mk.gee','Radiohead','Cocteau Twins'],['Frank Ocean','SZA','Solange'],['KAYTRANADA','Blood Orange','Sampha'],['Sampha','Solange','Frank Ocean'],['Magdalena Bay','Mk.gee','KAYTRANADA'],['Blood Orange','Clairo','Solange'],['The Marías','Clairo','SZA'],['Radiohead','Mk.gee','Cocteau Twins'],['Cocteau Twins','Magdalena Bay','The Marías'],['Sampha','KAYTRANADA','Blood Orange'],['Frank Ocean','Clairo','Magdalena Bay']];
artistLists.forEach((list,id)=>{for(const name of albumArtists[id])if(!list.includes(name))list.push(name);});
export const artistCatalog=[...new Map(artistLists.flat().map(name=>[normalizeArtist(name),name])).values()].sort((a,b)=>a.localeCompare(b));
export const memberCount=artist=>artistLists.filter(list=>list.some(a=>normalizeArtist(a)===normalizeArtist(artist))).length;
