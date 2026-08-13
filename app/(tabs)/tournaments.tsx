import {ScrollView,StyleSheet,Text,View} from 'react-native';
import {Button,Card,Hero,Pill} from '@/components/UI';
import {C} from '@/constants/theme';
import {teams} from '@/data/demo';

export default function Tournaments() {
  return (
    <ScrollView contentContainerStyle={s.p}>
      <Hero eyebrow="ACTIVE SEASON" title="Riyadh Premier League" subtitle="8 teams - T20 - round robin plus playoffs"/>
      <View style={s.row}>
        <Text style={s.h}>Teams</Text>
        <Button title="Add team" secondary/>
      </View>
      {teams.map(t=>(
        <Card key={t.id} style={s.team}>
          <View style={[s.logo,{backgroundColor:t.color}]}><Text style={s.short}>{t.short}</Text></View>
          <View style={s.grow}>
            <Text style={s.name}>{t.name}</Text>
            <Text style={s.meta}>{t.played} played - {t.won} wins - NRR {t.nrr}</Text>
          </View>
          <Pill text={`${t.pts} PTS`}/>
        </Card>
      ))}
      <Text style={s.h}>Tournament controls</Text>
      <Card>
        <Text style={s.name}>Organizer workspace</Text>
        <Text style={s.meta}>Create fixtures, register players, appoint scorers, configure overs, publish announcements and export reports.</Text>
        <View style={s.spacer}/>
        <Button title="Manage tournament"/>
      </Card>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  p:{padding:18,paddingTop:58,paddingBottom:110,backgroundColor:C.bg},
  row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  h:{color:C.white,fontSize:20,fontWeight:'900',marginVertical:16},
  team:{flexDirection:'row',alignItems:'center',marginBottom:10},
  logo:{width:48,height:48,borderRadius:16,alignItems:'center',justifyContent:'center',marginRight:12},
  short:{fontWeight:'900',color:'#061713'},
  grow:{flex:1},
  name:{color:C.white,fontWeight:'900',fontSize:16},
  meta:{color:C.muted,marginTop:5,lineHeight:19},
  spacer:{height:12},
});
