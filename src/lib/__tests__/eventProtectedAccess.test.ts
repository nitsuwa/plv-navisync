import { expect, it } from "vitest";
import { eventProtectedAccessRegions } from "../eventLayoutValidation";
it("protects visible entrances and permanent furniture without inventing room exclusions",()=>{
 const regions=eventProtectedAccessRegions({doors:[{id:"d",x:100,y:50,width:20,direction:"left",color:"red"}],furniture:[{id:"f",x:10,y:10,width:30,height:30,name:"Fixed desk",type:"table",category:"event",rotation:0,color:"blue"}]});
 expect(regions).toHaveLength(2);
 expect(regions[0].label).toMatch(/entrance/i);
 expect(regions[1].width).toBe(30);
});
