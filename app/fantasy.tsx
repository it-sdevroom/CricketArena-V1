import {useMemo,useState} from 'react';
import {ScrollView,StyleSheet,Text,View} from 'react-native';
import {Button,Card,Pill} from '@/components/UI';
import {C} from '@/constants/theme';
import {players} from '@/data/demo';

export default function Fantasy() {
  const [chosen,setChosen] = useState<string[]>([]);
  const used = useMemo(()=>players.filter(p=>chosen.includes(p.id)).reduce((a,p)=>a + p.credits,0),[chosen]);

  function pick(id:string) {
    setChosen(x=>x.includes(id) ? x.filter(v=>v!==id) : x.length < 7 ? [...x,id] : x);
  }

  return (
    <ScrollView contentContainerStyle={s.p}>
      <Text style={s.title}>Build your XI</Text>
      <Text style={s.sub}>Choose up to 7 available players for this prototype contest</Text>
      <Card style={s.summary}>
        <View><Text style={s.big}>{chosen.length}/7</Text><Text style={s.meta}>Players</Text></View>
        <View><Text style={s.big}>{70 - used}</Text><Text style={s.meta}>Credits left</Text></View>
        <Pill text="Round 5"/>
      </Card>
      {players.map(p=>{
        const on = chosen.includes(p.id);
        return (
          <Card key={p.id} style={[s.player,on&&s.selected]}>
            <View style={s.avatar}><Text style={s.initial}>{p.name[0]}</Text></View>
            <View style={s.grow}>
              <Text style={s.name}>{p.name}</Text>
              <Text style={s.meta}>{p.team} - {p.role} - {p.runs} runs - {p.wickets} wkts</Text>
            </View>
            <Button title={on ? 'Selected' : `${p.credits} cr`} secondary={!on} disabled={!on && chosen.length >= 7} onPress={()=>pick(p.id)}/>
          </Card>
        );
      })}
      <Button title="Save fantasy team" disabled={chosen.length < 7}/>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  p:{padding:18,paddingBottom:50,backgroundColor:C.bg},
  title:{color:C.white,fontSize:29,fontWeight:'900'},
  sub:{color:C.muted,marginTop:5,marginBottom:18},
  summary:{flexDirection:'row',justifyContent:'space-around',alignItems:'center',marginBottom:15},
  big:{color:C.lime,fontSize:25,fontWeight:'900'},
  meta:{color:C.muted,fontSize:12,marginTop:3},
  player:{flexDirection:'row',alignItems:'center',marginBottom:9,padding:12,gap:10},
  selected:{borderColor:C.green,backgroundColor:C.green+'12'},
  avatar:{width:43,height:43,borderRadius:14,backgroundColor:C.card2,alignItems:'center',justifyContent:'center'},
  initial:{color:C.green,fontWeight:'900'},
  grow:{flex:1},
  name:{color:C.white,fontWeight:'900'},
});
