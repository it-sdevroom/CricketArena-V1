import {ScrollView,StyleSheet,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {Button,Card,Pill,StatTile} from '@/components/UI';
import {C} from '@/constants/theme';

const actions = [
  ['add','Create match','Configure teams, venue, overs and officials'],
  ['person-add','Register player','Add profile, role, shirt number and documents'],
  ['calendar','Generate fixtures','Round robin, groups, knockout or custom schedule'],
  ['shield-checkmark','Assign officials','Scorers, umpires, referee and stream operator'],
  ['megaphone','Publish announcement','Notify all teams, selected teams or officials'],
  ['download','Export reports','Scorecards, standings and player statistics'],
];

export default function Organizer() {
  return (
    <ScrollView contentContainerStyle={s.p}>
      <View style={s.row}>
        <View>
          <Text style={s.title}>Organizer console</Text>
          <Text style={s.sub}>Riyadh Premier League</Text>
        </View>
        <Pill text="ADMIN" tone="amber"/>
      </View>
      <View style={s.metrics}>
        <StatTile value="8" label="Teams"/>
        <StatTile value="120" label="Players"/>
        <StatTile value="15" label="Matches"/>
        <StatTile value="2" label="Pending"/>
      </View>
      {actions.map((x)=>(
        <Card style={s.action} key={x[1]}>
          <View style={s.icon}><Ionicons name={x[0] as any} color={C.green} size={22}/></View>
          <View style={s.grow}>
            <Text style={s.name}>{x[1]}</Text>
            <Text style={s.meta}>{x[2]}</Text>
          </View>
          <Ionicons name="chevron-forward" color={C.muted}/>
        </Card>
      ))}
      <Button title="Create tournament backup" secondary/>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  p:{padding:18,paddingBottom:50,backgroundColor:C.bg},
  row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  title:{color:C.white,fontSize:27,fontWeight:'900'},
  sub:{color:C.muted,marginTop:4},
  metrics:{flexDirection:'row',flexWrap:'wrap',gap:9,marginVertical:20},
  action:{flexDirection:'row',alignItems:'center',gap:12,marginBottom:9},
  icon:{width:43,height:43,borderRadius:14,backgroundColor:C.green+'15',alignItems:'center',justifyContent:'center'},
  grow:{flex:1},
  name:{color:C.white,fontWeight:'900'},
  meta:{color:C.muted,fontSize:12,marginTop:4,lineHeight:17},
});
