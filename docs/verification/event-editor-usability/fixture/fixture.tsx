import {useCallback, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Canvas} from '@react-three/fiber';
import * as THREE from 'three';
import '/src/styles/index.css';
import {EventFloorEditor} from '/src/components/events/EventFloorEditor';
import {EventAsset3DLayer} from '/src/components/events/EventAsset3DLayer';
import {EVENT_FURNITURE_TEMPLATES, eventFurnitureFromTemplate} from '/src/components/events/eventAssets';
import {eventAsset3DTransform} from '/src/lib/event3dLayout';
import {resolveFloorPlanForEvent} from '/src/lib/eventLocationData';
import {setThemePreference} from '/src/hooks/useTheme';
import campus from './campus.json';

const building=campus.buildings.find(b=>b.code==='COED')!;
const locations={indoor:{type:'building',buildingId:building.id,floorId:`${building.id}-f1`,label:'COED — Ground Floor'},outdoor:{type:'campus',label:'Campus Grounds'}};
const initial={indoor:{items:[],labels:[]},outdoor:{items:[],labels:[]}};
function Models(){
  const items=EVENT_FURNITURE_TEMPLATES.map((t,i)=>({...eventFurnitureFromTemplate(t,(i%4)*500,Math.floor(i/4)*400,t.type),width:400,height:300}));
  const frame={scale:0.025,originX:0,originY:0};
  return <Canvas camera={{position:[30,35,40],fov:50}} onCreated={({scene})=>{window.assetBounds=()=>items.map(item=>{const object=scene.getObjectByName(`event-asset-${item.id}`);return object?{type:item.type,rendered:new THREE.Box3().setFromObject(object,true).getSize(new THREE.Vector3()).toArray(),expected:eventAsset3DTransform(item,frame).height}:null;}).filter(Boolean);}}><ambientLight intensity={1.2}/><directionalLight position={[20,40,10]}/><EventAsset3DLayer furniture={items} frame={frame}/></Canvas>;
}
function Fixture(){
  const [map,setMap]=useState<'indoor'|'outdoor'>('indoor'),[dark,setDark]=useState(false),[review,setReview]=useState(false),[generation,setGeneration]=useState(0),[drafts,setDrafts]=useState(initial),[saved,setSaved]=useState(initial);
  const capture=useRef(null),finalize=useRef(null);
  const changed=useCallback((items,labels)=>setDrafts(previous=>({...previous,[map]:{items,labels}})),[map]);
  const floor=resolveFloorPlanForEvent(map==='indoor'?building.id:'campus',map==='indoor'?1:undefined,campus)!;
  const data=drafts[map];
  return <div className="flex flex-col bg-background text-foreground" style={{height:'100dvh'}}>
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b p-2 text-xs"><strong>Isolated published-map fixture</strong>{(['indoor','outdoor'] as const).map(key=><button key={key} onClick={()=>setMap(key)}>{key==='indoor'?'COED floor':'Campus grounds'}</button>)}<button onClick={()=>{setDark(!dark);setThemePreference(dark?'light':'dark');}}>Toggle theme</button><button onClick={()=>{setDrafts(saved);setGeneration(n=>n+1);}}>Reopen saved layout</button><button onClick={()=>setReview(value=>!value)}>Toggle admin review</button></div>
    <div className="min-h-0 flex-1"><EventFloorEditor key={`${map}:${generation}:${review}`} floorPlan={floor} activeCampus={campus} overlay={{id:'local-usability-draft',title:'College Week — local fixture',description:'No live event writes',organizer:'Demo Council',status:review?'pending':'draft',isActive:true,markers:[],restrictedAreas:[],locationRef:locations[map],eventFurniture:data.items,eventLabels:data.labels}} readOnly={review} onDraftChange={changed} interactionCommitRef={capture} finalizeDraftRef={finalize} onSave={async(items,labels)=>{setSaved(previous=>{const next={...previous,[map]:{items,labels}};window.usabilitySavedLayouts=next;return next;});finalize.current?.();return true;}} onSubmit={async()=>false} onBack={()=>{}}/></div>
  </div>;
}
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).get('case')==='models'?<div style={{height:'100dvh'}}><Models/></div>:<Fixture/>);
