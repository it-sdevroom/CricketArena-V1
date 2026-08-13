import {ScrollView,StyleSheet,Text,View} from 'react-native';
import {router} from 'expo-router';
import {Button,Card,Pill} from '@/components/UI';
import {C} from '@/constants/theme';
import {fixtures} from '@/data/demo';

export default function Matches() {
  return (
    <ScrollView contentContainerStyle={s.p}>
      <Text style={s.title}>Match center</Text>
      <Text style={s.sub}>Live, upcoming and completed fixtures</Text>
      {fixtures.map(f=>(
        <Card key={f.id} style={s.card}>
          <View style={s.row}>
            <Pill text={f.live ? 'LIVE' : 'UPCOMING'} tone={f.live ? 'red' : 'green'}/>
            <Text style={s.date}>{f.date}</Text>
          </View>
          <Text style={s.stage}>{f.stage}</Text>
          <Text style={s.teams}>{f.a} <Text style={s.dim}>vs</Text> {f.b}</Text>
          <Text style={s.venue}>{f.venue}</Text>
          <Text style={s.status}>{f.status}</Text>
          {f.live && <Button title="Score this match" onPress={()=>router.push('/scorer')}/>}
        </Card>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  p:{padding:18,paddingTop:60,paddingBottom:110,backgroundColor:C.bg},
  title:{fontSize:30,fontWeight:'900',color:C.white},
  sub:{color:C.muted,marginTop:5,marginBottom:20},
  card:{marginBottom:12},
  row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  date:{color:C.muted},
  stage:{color:C.green,fontWeight:'900',fontSize:12,marginTop:18},
  teams:{fontSize:23,fontWeight:'900',color:C.white,marginTop:8,marginBottom:8},
  dim:{color:C.muted},
  venue:{color:C.muted,marginBottom:8},
  status:{color:C.amber,fontWeight:'800',marginBottom:16},
});
