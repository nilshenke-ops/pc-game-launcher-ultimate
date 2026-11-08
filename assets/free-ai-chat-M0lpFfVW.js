import{g5 as l,t as o,g6 as u,fX as g,gd as m,fU as p,ge as A,gf as h}from"./index-Da-gBp2_.js";import"./react-2SIwwJO3.js";const s=(e,t={})=>({text:e,actions:[],sources:[],suggestions:[],mode:"device",...t});function w(e,t){return s(`${t?t+`

`:""}${o(p)}`,{actions:[{kind:"freeAiChoice",label:o("Ja, freie KI nutzen"),params:{question:e,ok:!0}},{kind:"freeAiChoice",label:o("Nein"),params:{question:e,ok:!1}}]})}async function $(e,t,n,d){const i=h(),a=l().length>0,c=A(),f=c.openrouter==="locked"||c.groq==="locked";if(!a&&i==="no")return f?s(`${n.text}

${o("Dein Schlüssel auf diesem Gerät ist gesperrt – unten in der KI-Verwaltung entsperren, dann antwortet OpenRouter bzw. Groq.")}`,{mode:n.mode}):n;if(!a&&i==="ask")return w(e,n.text);try{const r=await u(e,t,{onWait:d});return s(r.text,{mode:"free",model:r.model||null,costUsd:0,sources:[r.provider==="pollinations"?g:r.label],research:void 0})}catch(r){return s(`${r instanceof m?r.message:o("Die freie KI hat nicht geantwortet.")}

${n.text}`,{failed:!1})}}export{$ as freeAiAnswer,w as freeAiOffer};
