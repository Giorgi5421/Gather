import {create} from "zustand";
export type AppView="feed"|"friends"|"messages"|"stories"|"groups"|"pages"|"notifications"|"profile";
type AppStore={view:AppView;setView:(view:AppView)=>void;openConversationId:string|null;setOpenConversationId:(id:string|null)=>void};
export const useAppStore=create<AppStore>((set)=>({view:"feed",setView:(view)=>set({view}),openConversationId:null,setOpenConversationId:(openConversationId)=>set({openConversationId})}));
