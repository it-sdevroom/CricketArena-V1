import {ScrollView,StyleSheet,Text,View} from 'react-native';
import {Card,Pill} from '@/components/UI';
import {C} from '@/constants/theme';
import {players,teams} from '@/data/demo';

export default function Stats() {
  return (
    <ScrollView contentContainerStyle={s.p}>
      <Text style={s.title}>Statistics</Text>
      <Text style={s.sub}>Leaders and tournament rankings</Text>

      <Text style={s.h}>Top run scorers</Text>
      {[...players].sort((a,b)=>b.runs-a.runs).slice(0,5).map((p,i)=>(
        <Card style={s.line} key={p.id}>
          <Text style={s.rank}>{i + 1}</Text>
          <View style={s.grow}>
            <Text style={s.name}>{p.name}</Text>
            <Text style={s.meta}>{p.team} - {p.role} - SR {p.strikeRate}</Text>
          </View>
          <Text style={s.value}>{p.runs}</Text>
        </Card>
      ))}

      <Text style={s.h}>Top wicket takers</Text>
      {[...players].sort((a,b)=>b.wickets-a.wickets).slice(0,5).map((p,i)=>(
        <Card style={s.line} key={p.id}>
          <Text style={s.rank}>{i + 1}</Text>
          <View style={s.grow}>
            <Text style={s.name}>{p.name}</Text>
            <Text style={s.meta}>{p.team} - economy {p.economy}</Text>
          </View>
          <Text style={s.value}>{p.wickets}</Text>
        </Card>
      ))}

      <Text style={s.h}>Standings</Text>
      {teams.map((t,i)=>(
        <View style={s.stand} key={t.id}>
          <Text style={s.rank}>{i + 1}</Text>
          <Text style={s.name}>{t.name}</Text>
          <Text style={s.nrr}>NRR {t.nrr}</Text>
          <Pill text={`${t.pts} PTS`}/>
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  p:{padding:18,paddingTop:60,paddingBottom:110,backgroundColor:C.bg},
  title:{fontSize:30,fontWeight:'900',color:C.white},
  sub:{color:C.muted,marginTop:5},
  h:{color:C.white,fontSize:20,fontWeight:'900',marginTop:24,marginBottom:12},
  line:{flexDirection:'row',alignItems:'center',marginBottom:8,padding:13},
  rank:{color:C.muted,fontWeight:'900',width:30},
  grow:{flex:1},
  name:{color:C.white,fontWeight:'800',flex:1},
  meta:{color:C.muted,fontSize:12,marginTop:3},
  value:{color:C.lime,fontWeight:'900',fontSize:20},
  stand:{flexDirection:'row',alignItems:'center',paddingVertical:14,borderBottomColor:C.line,borderBottomWidth:1,gap:10},
  nrr:{color:C.muted,fontSize:12},
});
