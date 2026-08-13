import {ScrollView,StyleSheet,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {Card,Pill} from '@/components/UI';
import {C} from '@/constants/theme';

const notifications = [
  ['radio','Match 12 is live','Riyadh Falcons won the toss and elected to bat.','NOW'],
  ['trophy','Result published','Desert Warriors won Match 10 by 18 runs.','2H'],
  ['calendar','Fixture updated','Tomorrow match will begin at 5:00 PM.','5H'],
  ['people','Player registration','Two registrations await organizer approval.','1D'],
];

export default function Notifications() {
  return (
    <ScrollView contentContainerStyle={s.p}>
      <Text style={s.title}>Notifications</Text>
      <Text style={s.sub}>Match, team and organizer alerts</Text>
      {notifications.map((x,i)=>(
        <Card style={s.item} key={x[1]}>
          <View style={s.icon}><Ionicons name={x[0] as any} color={C.green} size={22}/></View>
          <View style={s.grow}>
            <Text style={s.name}>{x[1]}</Text>
            <Text style={s.meta}>{x[2]}</Text>
          </View>
          <Pill text={x[3]} tone={i === 0 ? 'red' : 'green'}/>
        </Card>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  p:{padding:18,paddingBottom:50,backgroundColor:C.bg},
  title:{color:C.white,fontSize:29,fontWeight:'900'},
  sub:{color:C.muted,marginTop:5,marginBottom:18},
  item:{flexDirection:'row',gap:12,alignItems:'center',marginBottom:9},
  icon:{width:43,height:43,borderRadius:14,backgroundColor:C.green+'15',alignItems:'center',justifyContent:'center'},
  grow:{flex:1},
  name:{color:C.white,fontWeight:'900'},
  meta:{color:C.muted,fontSize:12,marginTop:4,lineHeight:17},
});
