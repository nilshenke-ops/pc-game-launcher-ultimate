import{gK as l,t as o,gL as u,gA as g,gS as m,gx as p,gT as A,gU as h}from"./index-zje-ivoY.js";import"./react-2SIwwJO3.js";const s=(e,t={})=>({text:e,actions:[],sources:[],suggestions:[],mode:"device",...t});function w(e,t){return s(`${t?t+`

`:""}${o(p)}`,{actions:[{kind:"freeAiChoice",label:o("Ja, freie KI nutzen"),params:{question:e,ok:!0}},{kind:"freeAiChoice",label:o("Nein"),params:{question:e,ok:!1}}]})}async function I(e,t,n,d){const i=h(),a=l().length>0,c=A(),f=c.openrouter==="locked"||c.groq==="locked";if(!a&&i==="no")return f?s(`${n.text}

${o("Dein Schlüssel auf diesem Gerät ist gesperrt – unten in der KI-Verwaltung entsperren, dann antwortet OpenRouter bzw. Groq.")}`,{mode:n.mode}):n;if(!a&&i==="ask")return w(e,n.text);try{const r=await u(e,t,{onWait:d});return s(r.text,{mode:"free",model:r.model||null,costUsd:0,sources:[r.provider==="pollinations"?g:r.label],research:void 0})}catch(r){return s(`${r instanceof m?r.message:o("Die freie KI hat nicht geantwortet.")}

${n.text}`,{failed:!1})}}export{I as freeAiAnswer,w as freeAiOffer};
