let csrf='';
export function setCsrf(value){csrf=value||'';}
export async function api(path,{method='GET',body,signal}={}){
 const response=await fetch(path,{method,credentials:'same-origin',signal,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(method!=='GET'?{'X-CSRF-Token':csrf}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 let result;try{result=await response.json();}catch{throw new Error('The server did not return a valid response. Please try again.');}
 if(!response.ok)throw new Error(result.error?.message||result.error||result.message||`Request failed (${response.status}).`);
 return result;
}
