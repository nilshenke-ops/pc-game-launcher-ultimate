import{gn as l,t as o,go as u,gd as g,gv as m,ga as p,gw as A,gx as h}from"./index-CPZLF_yr.js";import"./react-2SIwwJO3.js";const s=(e,n={})=>({text:e,actions:[],sources:[],suggestions:[],mode:"device",...n});function w(e,n){return s(`${n?n+`

`:""}${o(p)}`,{actions:[{kind:"freeAiChoice",label:o("Ja, freie KI nutzen"),params:{question:e,ok:!0}},{kind:"freeAiChoice",label:o("Nein"),params:{question:e,ok:!1}}]})}async function I(e,n,t,d){const i=h(),a=l().length>0,c=A(),f=c.openrouter==="locked"||c.groq==="locked";if(!a&&i==="no")return f?s(`${t.text}

${o("Dein Schlüssel auf diesem Gerät ist gesperrt – unten in der KI-Verwaltung entsperren, dann antwortet OpenRouter bzw. Groq.")}`,{mode:t.mode}):t;if(!a&&i==="ask")return w(e,t.text);try{const r=await u(e,n,{onWait:d});return s(r.text,{mode:"free",model:r.model||null,costUsd:0,sources:[r.provider==="pollinations"?g:r.label],research:void 0})}catch(r){return s(`${r instanceof m?r.message:o("Die freie KI hat nicht geantwortet.")}

${t.text}`,{failed:!1})}}export{I as freeAiAnswer,w as freeAiOffer};
