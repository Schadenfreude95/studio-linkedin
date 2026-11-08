export function normalizeBackup(input){
 if(!input||input.format!=='studio-posts'||input.version!==1||!Array.isArray(input.posts)||input.posts.length>2000)throw Error('Backup non valido.');
 const ids=new Set();
 return input.posts.map(p=>{
  if(!p||typeof p.id!=='string'||!p.id||p.id.length>120||ids.has(p.id)||typeof p.text!=='string'||p.text.length>3000||!['draft','planned'].includes(p.status))throw Error('Contenuto non valido.');
  ids.add(p.id);
  const date=typeof p.date==='string'?p.date:'';
  if(date&&Number.isNaN(new Date(date).getTime())||p.status==='planned'&&!date)throw Error('Data non valida.');
  const image=typeof p.image==='string'?p.image:'';
  if(image&&(!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(image)||image.length>2100000))throw Error('Immagine non valida.');
  return {id:p.id,text:p.text,date,status:p.status,image,updatedAt:Number.isFinite(p.updatedAt)?p.updatedAt:0};
 });
}
export function mergePosts(existing,imported){const map=new Map(existing.map(p=>[p.id,p]));for(const p of imported)map.set(p.id,p);return [...map.values()]}
