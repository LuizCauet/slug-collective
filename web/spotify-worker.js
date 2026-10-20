import {parseSpotifyFiles,SpotifyImportError} from './spotify-import.js';
let working=false;
self.onmessage=async event=>{
  if(working){self.postMessage({type:'error',code:'BUSY',message:'An import is already being read.'});return;}
  working=true;
  try{
    const result=await parseSpotifyFiles(event.data?.files,{onProgress:progress=>self.postMessage({type:'progress',...progress})});
    self.postMessage({type:'result',result});
  }catch(error){self.postMessage({type:'error',code:error instanceof SpotifyImportError?error.code:'IMPORT_FAILED',message:error instanceof SpotifyImportError?error.message:'Could not read this export. Choose the original Spotify ZIP or history JSON files.'});}
  finally{working=false;}
};
