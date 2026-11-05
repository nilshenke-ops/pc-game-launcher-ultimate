import{fa as f,fb as c,fc as u,t as s,fd as A,fe as d}from"./index-B9ciNE5Z.js";import"./react-2SIwwJO3.js";const i=(e,r={})=>({text:e,actions:[],sources:[],suggestions:[],mode:"device",...r});function m(e,r){return i(`${r?r+`

`:""}${s(A)}`,{actions:[{kind:"freeAiChoice",label:s("Ja, freie KI nutzen"),params:{question:e,ok:!0}},{kind:"freeAiChoice",label:s("Nein"),params:{question:e,ok:!1}}]})}async function l(e,r,n,a){const o=d();if(o==="no")return n;if(o==="ask")return m(e,n.text);try{const t=await f(e,{history:r,onWait:a});return i(t.text,{mode:"free",model:t.model||null,costUsd:0,sources:[c],research:void 0})}catch(t){return i(`${t instanceof u?t.message:s("Die freie KI hat nicht geantwortet.")}

${n.text}`,{failed:!1})}}export{l as freeAiAnswer,m as freeAiOffer};
