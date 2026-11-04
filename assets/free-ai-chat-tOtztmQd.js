import{f2 as a,f3 as f,f4 as c,t as s,f5 as u,f6 as A}from"./index-MHVDy1Nt.js";import"./react-2SIwwJO3.js";const i=(e,r={})=>({text:e,actions:[],sources:[],suggestions:[],mode:"device",...r});function m(e,r){return i(`${r?r+`

`:""}${s(u)}`,{actions:[{kind:"freeAiChoice",label:s("Ja, freie KI nutzen"),params:{question:e,ok:!0}},{kind:"freeAiChoice",label:s("Nein"),params:{question:e,ok:!1}}]})}async function h(e,r,n){const o=A();if(o==="no")return n;if(o==="ask")return m(e,n.text);try{const t=await a(e,{history:r});return i(t.text,{mode:"free",model:t.model||null,costUsd:0,sources:[f],research:void 0})}catch(t){return i(`${t instanceof c?t.message:s("Die freie KI hat nicht geantwortet.")}

${n.text}`,{failed:!1})}}export{h as freeAiAnswer,m as freeAiOffer};
