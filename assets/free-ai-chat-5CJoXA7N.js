import{hw as f,t as o,hx as l,hk as u,hE as m,hh as p,hF as A,hG as g}from"./index-s-GbI64F.js";import"./react-2SIwwJO3.js";const s=(e,t={})=>({text:e,actions:[],sources:[],suggestions:[],mode:"device",...t});function w(e,t){return s(`${t?t+`

`:""}${o(p)}`,{actions:[{kind:"freeAiChoice",label:o("Ja, freie KI nutzen"),params:{question:e,ok:!0}},{kind:"freeAiChoice",label:o("Nein"),params:{question:e,ok:!1}}]})}async function x(e,t,n,d){const i=g(),a=f().length>0,c=A(),h=c.openrouter==="locked"||c.groq==="locked";if(!a&&i==="no")return h?s(`${n.text}

${o("Dein Schlüssel auf diesem Gerät ist gesperrt – unten in der KI-Verwaltung entsperren, dann antwortet OpenRouter bzw. Groq.")}`,{mode:n.mode}):n;if(!a&&i==="ask")return w(e,n.text);try{const r=await l(e,t,{onWait:d});return s(r.text,{mode:"free",model:r.model||null,costUsd:0,sources:[r.provider==="pollinations"?u:r.label],research:void 0})}catch(r){return s(`${r instanceof m?r.message:o("Die freie KI hat nicht geantwortet.")}

${n.text}`,{failed:!1})}}export{x as freeAiAnswer,w as freeAiOffer};
