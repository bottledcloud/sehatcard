
import { buildFHIR, validateFHIR } from "./fhir.js";
import { deriveKey, encryptJSON, decryptStore, ub64 } from "./crypto.js";
import { autoMatch, searchTerms } from "./terminology.js";
import qrcode from "./qr.js";

  const $ = id => document.getElementById(id);
  const ENC="sehatcard.enc.v1", LEGACY="sehatcard.patients.v1";

  // ===== state =====
  let patients=[];            // in-memory, decrypted source of truth
  let cryptoKey=null, cryptoSalt=null;  // session
  let lang="en";
  // coding state for the patient currently in the form: cat -> {itemText -> {system,code,display}}
  let coding={allergy:{},cond:{},meds:{},hist:{}};

  const F={name:$("f-name"),age:$("f-age"),sex:$("f-sex"),blood:$("f-blood"),phone:$("f-phone"),
    abha:$("f-abha"),allergy:$("f-allergy"),cond:$("f-cond"),meds:$("f-meds"),hist:$("f-hist"),
    ecname:$("f-ecname"),ecphone:$("f-ecphone")};

  const I18N={
    en:{title:"Patient Health Summary",blood:"Blood",allergyH:"⚠ Allergies",noAllergy:"No known allergies recorded",
        cond:"Ongoing conditions",meds:"Current medications",hist:"Past history",
        scan:"Scan for offline summary",scansub:"Works with no internet. The code carries the data itself.",
        emerg:"Emergency",none:"None recorded",gen:"Generated"},
    hi:{title:"रोगी स्वास्थ्य सारांश",blood:"रक्त समूह",allergyH:"⚠ एलर्जी",noAllergy:"कोई ज्ञात एलर्जी दर्ज नहीं",
        cond:"मौजूदा बीमारियाँ",meds:"वर्तमान दवाइयाँ",hist:"पिछला इतिहास",
        scan:"ऑफ़लाइन सारांश हेतु स्कैन करें",scansub:"बिना इंटरनेट काम करता है। कोड में जानकारी मौजूद है।",
        emerg:"आपातकालीन संपर्क",none:"दर्ज नहीं",gen:"बनाया गया"},
    kn:{title:"ರೋಗಿಯ ಆರೋಗ್ಯ ಸಾರಾಂಶ",blood:"ರಕ್ತ ಗುಂಪು",allergyH:"⚠ ಅಲರ್ಜಿ",noAllergy:"ಯಾವುದೇ ಅಲರ್ಜಿ ದಾಖಲಾಗಿಲ್ಲ",
        cond:"ಚಾಲ್ತಿಯ ಕಾಯಿಲೆಗಳು",meds:"ಪ್ರಸ್ತುತ ಔಷಧಗಳು",hist:"ಹಿಂದಿನ ಇತಿಹಾಸ",
        scan:"ಆಫ್‌ಲೈನ್ ಸಾರಾಂಶಕ್ಕೆ ಸ್ಕ್ಯಾನ್ ಮಾಡಿ",scansub:"ಇಂಟರ್ನೆಟ್ ಇಲ್ಲದೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ. ಕೋಡ್‌ನಲ್ಲಿ ಮಾಹಿತಿ ಇದೆ.",
        emerg:"ತುರ್ತು ಸಂಪರ್ಕ",none:"ದಾಖಲಾಗಿಲ್ಲ",gen:"ರಚಿಸಲಾಗಿದೆ"}
  };

  const lines=s=>(s||"").split(/\n|,/).map(x=>x.trim()).filter(Boolean);
  const esc=s=>(s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

  function read(){return{
    name:F.name.value.trim(),age:F.age.value.trim(),sex:F.sex.value,blood:F.blood.value,
    phone:F.phone.value.trim(),abha:F.abha.value.trim(),allergy:lines(F.allergy.value),
    cond:lines(F.cond.value),meds:lines(F.meds.value),hist:F.hist.value.trim(),
    ecname:F.ecname.value.trim(),ecphone:F.ecphone.value.trim(),codes:coding};}
  function write(p){
    F.name.value=p.name||"";F.age.value=p.age||"";F.sex.value=p.sex||"";F.blood.value=p.blood||"";
    F.phone.value=p.phone||"";F.abha.value=p.abha||"";F.allergy.value=(p.allergy||[]).join("\n");
    F.cond.value=(p.cond||[]).join("\n");F.meds.value=(p.meds||[]).join("\n");F.hist.value=p.hist||"";
    F.ecname.value=p.ecname||"";F.ecphone.value=p.ecphone||"";
    coding=p.codes&&typeof p.codes==="object"?{allergy:p.codes.allergy||{},cond:p.codes.cond||{},meds:p.codes.meds||{},hist:p.codes.hist||{}}:{allergy:{},cond:{},meds:{},hist:{}};
  }

  // ===== QR =====
  function qrPayload(p){
    const o={v:1,n:p.name,ag:p.age,sx:p.sex,bg:p.blood};
    if(p.abha)o.ab=p.abha; if(p.allergy.length)o.al=p.allergy; if(p.cond.length)o.co=p.cond;
    if(p.meds.length)o.rx=p.meds; if(p.ecname||p.ecphone)o.ec=((p.ecname?p.ecname+" ":"")+(p.ecphone||"")).trim();
    return JSON.stringify(o);
  }
  function makeQR(text){const q=qrcode(0,"M");q.addData(text);q.make();return q.createSvgTag({cellSize:4,margin:0,scalable:true});}

  // ===== crypto (encrypted store) =====
  async function persist(){
    if(!cryptoKey)return false;
    const store=await encryptJSON(cryptoKey,cryptoSalt,patients);
    localStorage.setItem(ENC,JSON.stringify(store));
    localStorage.removeItem(LEGACY);
    $("legacyBanner").style.display="none";
    return true;
  }
  async function unlock(pass){
    const store=JSON.parse(localStorage.getItem(ENC));
    const salt=ub64(store.salt), key=await deriveKey(pass,salt);
    patients=await decryptStore(key,store); // throws on wrong passphrase
    cryptoKey=key; cryptoSalt=salt;
  }

  // ===== modal helpers (promise-based) =====
  function askNewPassphrase(){
    return new Promise(res=>{
      const s=$("passScrim"); $("passNew").value="";$("passConfirm").value="";$("passErr").textContent="";
      s.classList.add("show"); $("passNew").focus();
      const close=v=>{s.classList.remove("show");$("passGo").onclick=null;$("passCancel").onclick=null;res(v);};
      $("passGo").onclick=()=>{
        const a=$("passNew").value, b=$("passConfirm").value;
        if(a.length<6){$("passErr").textContent="At least 6 characters.";return;}
        if(a!==b){$("passErr").textContent="Passphrases don’t match.";return;}
        close(a);
      };
      $("passCancel").onclick=()=>close(null);
    });
  }

  // ===== coding modal =====
  const CAT_LABEL={allergy:"Allergies",cond:"Conditions",meds:"Medications",hist:"Past history"};
  function codingItems(){
    const p=read();
    return {allergy:p.allergy,cond:p.cond,meds:p.meds,hist:p.hist?[p.hist]:[]};
  }
  function codedCount(){
    const items=codingItems(); let total=0,done=0;
    Object.keys(items).forEach(cat=>items[cat].forEach(it=>{total++;if(coding[cat]&&coding[cat][it])done++;}));
    return {total,done};
  }
  function updateCodeBadge(){
    const b=$("btnCode"); const {total,done}=codedCount();
    b.innerHTML='Code terms'+(total?' <span class="code-badge '+(done===total?'all':'some')+'">'+done+'/'+total+'</span>':'');
  }
  function openCoding(){
    const items=codingItems();
    // auto-suggest exact matches for not-yet-coded items (non-destructive)
    Object.keys(items).forEach(cat=>{ if(cat==="hist")return; items[cat].forEach(it=>{
      if(!coding[cat]||!coding[cat][it]){ const m=autoMatch(cat,it); if(m){coding[cat]=coding[cat]||{};coding[cat][it]={...m,auto:true};} }
    });});
    renderCodingBody(items);
    $("codeScrim").classList.add("show");
  }
  function renderCodingBody(items){
    const body=$("codeBody"); body.innerHTML="";
    const cats=["allergy","cond","meds","hist"];
    let any=false;
    cats.forEach(cat=>{
      const list=items[cat]; if(!list.length)return; any=true;
      const searchable=cat!=="hist"; // no seed list for history; manual only
      const g=document.createElement("div"); g.className="cgroup";
      g.innerHTML='<div class="cgroup-h">'+CAT_LABEL[cat]+'</div>';
      list.forEach(it=>{
        const cur=coding[cat]&&coding[cat][it];
        const row=document.createElement("div"); row.className="crow";
        const stateHtml = cur
          ? '<span class="coded">✓ '+esc(cur.display)+' <span class="scode">SCT '+esc(cur.code)+'</span>'+(cur.auto?'<span class="auto">auto</span>':'')+'</span>'
          : '<span class="uncoded">plain text (no code)</span>';
        row.innerHTML='<div class="crow-top"><span class="term">'+esc(it)+'</span><span class="state">'+stateHtml+'</span></div>'+
          '<div class="crow-actions">'+
            (searchable?'<button class="mini" data-act="search">Search</button>':'')+
            (cur?'<button class="mini btn-danger" data-act="clear">Remove code</button>':'')+
          '</div>'+
          (searchable?'<div class="csearch"><input type="text" placeholder="Search SNOMED terms…"><div class="cresults"></div></div>':'');
        const sbtn=row.querySelector('[data-act="search"]');
        const cbtn=row.querySelector('[data-act="clear"]');
        const sbox=row.querySelector(".csearch");
        const sinput=sbox&&sbox.querySelector("input");
        const sres=sbox&&sbox.querySelector(".cresults");
        if(sbtn)sbtn.onclick=()=>{sbox.classList.toggle("open");if(sbox.classList.contains("open"))sinput.focus();};
        if(cbtn)cbtn.onclick=()=>{if(coding[cat])delete coding[cat][it];renderCodingBody(items);};
        if(sinput)sinput.oninput=()=>{
          const rs=searchTerms(cat,sinput.value);
          if(!sinput.value.trim()){sres.classList.remove("show");return;}
          sres.classList.add("show");
          if(!rs.length){sres.innerHTML='<div class="cnone">No match in starter set — leave as plain text, or add to the terminology table.</div>';return;}
          sres.innerHTML=rs.map((r,i)=>'<div class="cresult" data-i="'+i+'">'+esc(r.display)+' <span class="scode">SCT '+esc(r.code)+'</span></div>').join("");
          sres.querySelectorAll(".cresult").forEach(el=>{el.onclick=()=>{coding[cat]=coding[cat]||{};coding[cat][it]=rs[+el.dataset.i];renderCodingBody(items);};});
        };
        g.appendChild(row);
      });
      body.appendChild(g);
    });
    if(!any)body.innerHTML='<p class="sub">No clinical terms to code yet. Add allergies, conditions, or medications first.</p>';
  }
  $("btnCode").onclick=()=>{ const p=read(); if(!p.allergy.length&&!p.cond.length&&!p.meds.length&&!p.hist){toast("Add some clinical terms first");return;} openCoding(); };
  $("codeCancel").onclick=()=>{$("codeScrim").classList.remove("show");render();};
  $("codeApply").onclick=()=>{
    // strip the transient 'auto' flag so stored codes are clean
    Object.keys(coding).forEach(cat=>Object.keys(coding[cat]||{}).forEach(k=>{if(coding[cat][k])delete coding[cat][k].auto;}));
    $("codeScrim").classList.remove("show"); updateCodeBadge();
    const {done,total}=codedCount(); toast(done+" of "+total+" coded");
  };

  // ===== render =====
  function render(){
    const p=read(), t=I18N[lang];
    $("t-title").textContent=t.title;
    $("c-name").textContent=p.name||"—";

    const demo=$("c-demo");demo.innerHTML="";
    const add=(txt)=>{if(!txt)return;const s=document.createElement("span");s.className="chip";s.textContent=txt;demo.appendChild(s);};
    add(p.age?p.age+" yr":""); add(p.sex);

    const bb=$("c-blood");
    $("t-blood").textContent=t.blood;
    if(p.blood){bb.className="blood-badge";bb.querySelector(".bl-val").textContent=p.blood;}
    else{bb.className="blood-badge unknown";bb.querySelector(".bl-val").textContent="?";}

    const ab=$("c-abha");
    if(p.abha){ab.style.display="block";ab.textContent="ABHA · "+p.abha;}else ab.style.display="none";

    const al=$("c-allergy");
    if(p.allergy.length)al.innerHTML='<div class="allergy-band"><div class="ab-h">'+esc(t.allergyH)+'</div><div class="ab-v">'+p.allergy.map(esc).join(" · ")+'</div></div>';
    else al.innerHTML='<div class="allergy-none">'+esc(t.noAllergy)+'</div>';

    const tagify=arr=>arr.length?arr.map(x=>'<span class="tag">'+esc(x)+'</span>').join(""):'<span class="muted">'+esc(t.none)+'</span>';
    $("t-cond").textContent=t.cond;$("c-cond").innerHTML=tagify(p.cond);
    $("t-meds").textContent=t.meds;$("c-meds").innerHTML=tagify(p.meds);
    $("t-hist").textContent=t.hist;$("sec-hist").style.display=p.hist?"block":"none";$("c-hist").textContent=p.hist;

    const em=$("c-emerg");
    if(p.ecname||p.ecphone){em.style.display="block";em.innerHTML="<b>"+esc(t.emerg)+":</b> "+esc(((p.ecname?p.ecname+" ":"")+(p.ecphone||"")).trim());}
    else em.style.display="none";

    $("t-scan").textContent=t.scan;$("t-scansub").textContent=t.scansub;
    const warn=$("qrwarn");
    if(p.name){
      const payload=qrPayload(p),bytes=new Blob([payload]).size;
      try{$("qr").innerHTML=makeQR(payload);warn.innerHTML=bytes>900?'<span class="qr-warn">⚠ '+bytes+' bytes — large; trim meds/conditions for reliable scans.</span>':'';}
      catch(e){$("qr").innerHTML="";warn.innerHTML='<span class="qr-warn">⚠ Too much critical data for one QR. Shorten the lists.</span>';}
    }else{$("qr").innerHTML="";warn.innerHTML="";}

    $("c-gen").textContent=t.gen+" "+new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})+" · SehatCard v0.2";

    // prune codes whose source term no longer exists, then refresh the badge
    const live={allergy:new Set(p.allergy),cond:new Set(p.cond),meds:new Set(p.meds),hist:new Set(p.hist?[p.hist]:[])};
    Object.keys(coding).forEach(cat=>Object.keys(coding[cat]||{}).forEach(k=>{if(!live[cat]||!live[cat].has(k))delete coding[cat][k];}));
    updateCodeBadge();
  }

  function renderList(){
    const wrap=$("plist");$("pcount").textContent=patients.length;
    if(!patients.length){wrap.innerHTML='<div class="empty">No saved patients yet. Fill the form and tap “Save patient”.</div>';return;}
    wrap.innerHTML="";
    patients.slice().reverse().forEach(p=>{
      const div=document.createElement("div");div.className="pitem";
      const meta=[p.age?p.age+"y":"",p.sex,p.blood,(p.allergy&&p.allergy.length)?(p.allergy.length+" allergy"):""].filter(Boolean).join(" · ");
      div.innerHTML='<div><div class="who">'+esc(p.name||"Unnamed")+'</div><div class="meta">'+esc(meta||"—")+'</div></div>'+
        '<div class="pitem-actions"><button class="mini" data-a="o">Open</button><button class="mini btn-danger" data-a="d">Delete</button></div>';
      div.querySelector('[data-a="o"]').onclick=()=>{write(p);render();toast("Opened "+(p.name||"patient"));window.scrollTo({top:0,behavior:"smooth"});};
      div.querySelector('[data-a="d"]').onclick=async()=>{const i=patients.findIndex(x=>x.id===p.id);if(i>-1){patients.splice(i,1);await persist();renderList();toast("Deleted");}};
      wrap.appendChild(div);
    });
  }

  function toast(m){const t=$("toast");t.textContent=m;t.classList.add("show");clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove("show"),1900);}

  // ===== actions =====
  $("btnSave").onclick=async()=>{
    const p=read(); if(!p.name){toast("Add a name first");F.name.focus();return;}
    p.id="p"+Date.now().toString(36); p.saved=new Date().toISOString();
    patients.push(p);
    if(!cryptoKey){
      const pass=await askNewPassphrase();
      if(!pass){patients.pop();return;}            // cancelled
      cryptoSalt=crypto.getRandomValues(new Uint8Array(16));
      cryptoKey=await deriveKey(pass,cryptoSalt);
      $("btnLock").style.display="inline-flex";
    }
    await persist(); renderList(); toast("Saved "+p.name);
  };
  $("btnNew").onclick=()=>{coding={allergy:{},cond:{},meds:{},hist:{}};write({});render();toast("Cleared");F.name.focus();};
  $("btnPrint").onclick=()=>window.print();

  $("btnLock").onclick=()=>{
    if(!localStorage.getItem(ENC)){toast("Nothing saved to lock yet");return;}
    cryptoKey=null;cryptoSalt=null;patients=[];renderList();
    showLock();
  };

  function renderValidation(v){
    const wrap=$("fhirValidate");
    const sum='<div class="vsum">'+
      (v.ok?'<span class="vchip ok-banner">✓ Valid R4 document structure</span>':'<span class="vchip err">✗ '+v.errors.length+' error'+(v.errors.length>1?'s':'')+'</span>')+
      '<span class="vchip pass">'+v.passed+' checks passed</span>'+
      (v.warnings.length?'<span class="vchip warn">'+v.warnings.length+' warning'+(v.warnings.length>1?'s':'')+'</span>':'')+
      '</div>';
    let list="";
    if(v.errors.length||v.warnings.length){
      list='<div class="vlist">'+
        v.errors.map(m=>'<div class="vrow e"><span class="ic">✗</span><span class="msg">'+esc(m)+'</span></div>').join("")+
        v.warnings.map(m=>'<div class="vrow w"><span class="ic">⚠</span><span class="msg">'+esc(m)+'</span></div>').join("")+
      '</div>';
    }
    wrap.innerHTML=sum+list;
  }
  $("btnFHIR").onclick=()=>{
    const p=read(); if(!p.name){toast("Add a name first");return;}
    const bundle=buildFHIR(p);
    renderValidation(validateFHIR(bundle));
    $("fhirJson").textContent=JSON.stringify(bundle,null,2);
    $("fhirScrim").classList.add("show");
  };
  $("fhirClose").onclick=()=>$("fhirScrim").classList.remove("show");
  $("fhirCopy").onclick=async()=>{try{await navigator.clipboard.writeText($("fhirJson").textContent);toast("FHIR JSON copied");}catch(e){toast("Copy failed");}};
  $("fhirDownload").onclick=()=>{
    const p=read();const blob=new Blob([$("fhirJson").textContent],{type:"application/json"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);
    a.download="fhir-bundle-"+(p.name||"patient").replace(/\s+/g,"_").toLowerCase()+".json";a.click();URL.revokeObjectURL(a.href);
  };

  $("btnCopyQR").onclick=async()=>{
    const p=read();
    const txt=["PATIENT HEALTH SUMMARY",
      p.name+(p.age?" · "+p.age+"y":"")+(p.sex?" · "+p.sex:"")+(p.blood?" · "+p.blood:""),
      p.abha?"ABHA: "+p.abha:"",
      "ALLERGIES: "+(p.allergy.length?p.allergy.join(", "):"none recorded"),
      "CONDITIONS: "+(p.cond.length?p.cond.join(", "):"none"),
      "MEDS: "+(p.meds.length?p.meds.join(", "):"none"),
      p.hist?"HISTORY: "+p.hist:"",
      (p.ecname||p.ecphone)?"EMERGENCY: "+((p.ecname?p.ecname+" ":"")+(p.ecphone||"")).trim():""].filter(Boolean).join("\n");
    try{await navigator.clipboard.writeText(txt);toast("Summary copied");}catch(e){toast("Copy failed");}
  };

  $("btnExport").onclick=()=>{
    if(!patients.length){toast("Nothing to export (unlock first if locked)");return;}
    const blob=new Blob([JSON.stringify(patients,null,2)],{type:"application/json"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);
    a.download="sehatcard-backup-"+new Date().toISOString().slice(0,10)+".json";a.click();URL.revokeObjectURL(a.href);
    toast("Exported (unencrypted backup)");
  };
  $("btnImport").onclick=()=>$("fileImport").click();
  $("fileImport").onchange=e=>{
    const file=e.target.files[0];if(!file)return;const r=new FileReader();
    r.onload=async()=>{
      try{
        const incoming=JSON.parse(r.result);if(!Array.isArray(incoming))throw 0;
        const ids=new Set(patients.map(x=>x.id));let added=0;
        incoming.forEach(p=>{if(p&&p.name){if(!p.id||ids.has(p.id))p.id="p"+Date.now().toString(36)+Math.random().toString(36).slice(2,5);patients.push(p);added++;}});
        if(cryptoKey)await persist();
        else if(added){const pass=await askNewPassphrase();if(pass){cryptoSalt=crypto.getRandomValues(new Uint8Array(16));cryptoKey=await deriveKey(pass,cryptoSalt);$("btnLock").style.display="inline-flex";await persist();}}
        renderList();toast("Imported "+added+" patient(s)");
      }catch(err){toast("Couldn’t read that file");}
      $("fileImport").value="";
    };
    r.readAsText(file);
  };

  document.querySelectorAll("#langSwitch button").forEach(b=>{
    b.onclick=()=>{lang=b.dataset.lang;document.querySelectorAll("#langSwitch button").forEach(x=>x.classList.toggle("on",x===b));render();};
  });
  Object.values(F).forEach(el=>el.addEventListener("input",render));

  // ===== lock overlay =====
  function showLock(){const s=$("lockScrim");$("lockPass").value="";$("lockErr").textContent="";s.classList.add("show");$("lockPass").focus();}
  $("lockGo").onclick=async()=>{
    try{await unlock($("lockPass").value);$("lockScrim").classList.remove("show");$("btnLock").style.display="inline-flex";render();renderList();toast("Unlocked");}
    catch(e){$("lockErr").textContent="Wrong passphrase, or data is corrupted.";}
  };
  $("lockPass").addEventListener("keydown",e=>{if(e.key==="Enter")$("lockGo").click();});
  $("passNew").addEventListener("keydown",e=>{if(e.key==="Enter")$("passConfirm").focus();});

  // ===== boot =====
  function seedFormIfEmpty(){
    if(!F.name.value){
      write({name:"Sunita Devi",age:"64",sex:"Female",blood:"B+",abha:"",
        allergy:["Penicillin"],cond:["Type 2 Diabetes","Hypertension"],
        meds:["Metformin 500mg","Amlodipine 5mg"],hist:"Cataract surgery 2022",
        ecname:"Rahul (son)",ecphone:"98XXXXXX10"});
    }
  }
  (function boot(){
    if(localStorage.getItem(ENC)){           // encrypted store exists → must unlock
      seedFormIfEmpty();render();
      showLock();
    }else{
      const legacy=(()=>{try{return JSON.parse(localStorage.getItem(LEGACY))||[]}catch(e){return[]}})();
      if(legacy.length){patients=legacy;$("legacyBanner").style.display="flex";}
      seedFormIfEmpty();render();renderList();
    }
  })();
