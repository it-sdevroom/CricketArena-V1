import {useEffect,useState} from 'react';
import {Alert,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Button,Card,Pill} from '@/components/UI';
import {C} from '@/constants/theme';

type Ball = {label:string;runs:number;wicket?:boolean;legal:boolean};

const initialHistory: Ball[] = [
  {label:'1',runs:1,legal:true},
  {label:'4',runs:4,legal:true},
  {label:'0',runs:0,legal:true},
  {label:'W',runs:0,wicket:true,legal:true},
  {label:'2',runs:2,legal:true},
];

const events: Array<[string,number,boolean,boolean]> = [
  ['WD',1,false,false],
  ['NB',1,false,false],
  ['BYE',1,false,true],
  ['LB',1,false,true],
  ['WICKET',0,true,true],
];

export default function Scorer() {
  const [runs,setRuns] = useState(142);
  const [wk,setWk] = useState(4);
  const [balls,setBalls] = useState(87);
  const [history,setHistory] = useState<Ball[]>(initialHistory);

  useEffect(()=>{
    AsyncStorage.getItem('score').then(v=>{
      if (!v) return;
      const d = JSON.parse(v);
      setRuns(d.runs);
      setWk(d.wk);
      setBalls(d.balls);
      setHistory(d.history);
    });
  },[]);

  useEffect(()=>{
    AsyncStorage.setItem('score',JSON.stringify({runs,wk,balls,history}));
  },[runs,wk,balls,history]);

  function add(n:number,label=String(n),wicket=false,legal=true) {
    setRuns(x=>x + n);
    if (wicket) setWk(x=>Math.min(10,x + 1));
    if (legal) setBalls(x=>x + 1);
    setHistory(x=>[...x,{runs:n,label,wicket,legal}].slice(-18));
  }

  function undo() {
    const h = history[history.length - 1];
    if (!h) return;
    setRuns(x=>Math.max(0,x - h.runs));
    if (h.wicket) setWk(x=>Math.max(0,x - 1));
    if (h.legal) setBalls(x=>Math.max(0,x - 1));
    setHistory(x=>x.slice(0,-1));
  }

  function resetMatch() {
    Alert.alert('Reset local score?', 'This clears the saved score on this device.', [
      {text:'Cancel',style:'cancel'},
      {text:'Reset',style:'destructive',onPress:()=>{setRuns(0);setWk(0);setBalls(0);setHistory([]);}},
    ]);
  }

  const over = `${Math.floor(balls / 6)}.${balls % 6}`;
  const crr = (runs / (balls / 6 || 1)).toFixed(2);

  return (
    <ScrollView contentContainerStyle={s.p}>
      <View style={s.row}>
        <Pill text="LIVE" tone="red"/>
        <Text style={s.save}>Auto-saved locally</Text>
      </View>
      <Text style={s.title}>RF <Text style={s.muted}>vs</Text> DW</Text>

      <Card style={s.scoreCard}>
        <Text style={s.innings}>RIYADH FALCONS - 1ST INNINGS</Text>
        <Text style={s.score}>{runs}/{wk}</Text>
        <Text style={s.over}>{over} overs - CRR {crr}</Text>
        <View style={s.balls}>
          {history.slice(-6).map((b,i)=>(
            <View key={`${b.label}-${i}`} style={[s.ball,b.wicket&&s.wicket,!b.legal&&s.extra]}>
              <Text style={s.ballT}>{b.label}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card style={s.bat}>
        <View>
          <Text style={s.player}>A. Rahman *</Text>
          <Text style={s.meta}>67 (42) - 4s: 7 - 6s: 2</Text>
        </View>
        <View style={s.batterRight}>
          <Text style={s.player}>R. Hussain</Text>
          <Text style={s.meta}>21 (16)</Text>
        </View>
      </Card>

      <Text style={s.h}>Runs</Text>
      <View style={s.pad}>
        {[0,1,2,3,4,6].map(n=>(
          <Pressable key={n} style={s.run} onPress={()=>add(n)}>
            <Text style={s.runT}>{n}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.h}>Extras and events</Text>
      <View style={s.pad}>
        {events.map((x)=>(
          <Pressable key={String(x[0])} style={[s.event,x[2]&&s.danger]} onPress={()=>add(Number(x[1]),String(x[0]),Boolean(x[2]),Boolean(x[3]))}>
            <Text style={[s.eventT,x[2]&&s.dangerText]}>{x[0]}</Text>
          </Pressable>
        ))}
      </View>

      <View style={s.actions}>
        <Button title="Undo last event" secondary onPress={undo}/>
        <Button title="End innings" onPress={()=>Alert.alert('End innings?', 'The chase target and second innings will be prepared.')}/>
        <Button title="Reset demo score" secondary onPress={resetMatch}/>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  p:{padding:18,paddingBottom:50,backgroundColor:C.bg},
  row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  save:{color:C.muted},
  title:{color:C.white,fontSize:25,fontWeight:'900',marginVertical:18},
  muted:{color:C.muted},
  scoreCard:{alignItems:'center'},
  innings:{color:C.green,fontWeight:'900',fontSize:12},
  score:{color:C.white,fontWeight:'900',fontSize:58,marginTop:8},
  over:{color:C.muted},
  balls:{flexDirection:'row',gap:8,marginTop:18,flexWrap:'wrap',justifyContent:'center'},
  ball:{width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:C.card2},
  wicket:{backgroundColor:C.red},
  extra:{borderWidth:1,borderColor:C.amber},
  ballT:{color:C.white,fontWeight:'900'},
  bat:{flexDirection:'row',justifyContent:'space-between',marginTop:12,gap:14},
  batterRight:{alignItems:'flex-end',flex:1},
  player:{color:C.white,fontWeight:'900'},
  meta:{color:C.muted,fontSize:12,marginTop:4},
  h:{color:C.white,fontWeight:'900',fontSize:18,marginTop:22,marginBottom:10},
  pad:{flexDirection:'row',flexWrap:'wrap',gap:10},
  run:{width:'30%',height:62,borderRadius:18,backgroundColor:C.card2,alignItems:'center',justifyContent:'center',borderColor:C.line,borderWidth:1},
  runT:{color:C.white,fontSize:24,fontWeight:'900'},
  event:{paddingHorizontal:18,height:50,borderRadius:15,borderColor:C.line,borderWidth:1,alignItems:'center',justifyContent:'center',backgroundColor:C.card},
  danger:{borderColor:C.red},
  eventT:{color:C.green,fontWeight:'900'},
  dangerText:{color:C.red},
  actions:{gap:10,marginTop:26},
});
