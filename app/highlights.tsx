import {ScrollView,StyleSheet,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {Button,Card,Pill} from '@/components/UI';
import {C} from '@/constants/theme';

const clips = [
  ['Match 11 Highlights','Falcons chased 181 with four balls remaining','08:42'],
  ['Top 5 Wickets','Best bowling moments from Round 4','04:15'],
  ['A. Rahman 94 off 51','Player of the match innings','06:03'],
];

export default function Highlights() {
  return (
    <ScrollView contentContainerStyle={s.p}>
      <Text style={s.title}>Watch cricket</Text>
      <Text style={s.sub}>Connect YouTube Live, Vimeo, Mux or an RTMP provider for production streams</Text>
      <Card style={s.live}>
        <Pill text="LIVE" tone="red"/>
        <Ionicons name="play-circle" size={72} color={C.white}/>
        <Text style={s.liveTitle}>RF vs DW - Match 12</Text>
        <Text style={s.meta}>Live camera or source URL is configurable by the organizer.</Text>
        <Button title="Open live stream"/>
      </Card>
      <Text style={s.h}>Latest highlights</Text>
      {clips.map(x=>(
        <Card key={x[0]} style={s.clip}>
          <View style={s.thumb}><Ionicons name="play" color={C.white} size={25}/></View>
          <View style={s.grow}>
            <Text style={s.name}>{x[0]}</Text>
            <Text style={s.meta}>{x[1]}</Text>
          </View>
          <Pill text={x[2]}/>
        </Card>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  p:{padding:18,paddingBottom:50,backgroundColor:C.bg},
  title:{color:C.white,fontWeight:'900',fontSize:29},
  sub:{color:C.muted,marginTop:5,marginBottom:18},
  live:{alignItems:'center',gap:12},
  liveTitle:{color:C.white,fontWeight:'900',fontSize:21},
  meta:{color:C.muted,fontSize:12,lineHeight:17},
  h:{color:C.white,fontWeight:'900',fontSize:20,marginTop:24,marginBottom:12},
  clip:{flexDirection:'row',alignItems:'center',gap:12,marginBottom:10},
  thumb:{width:70,height:55,borderRadius:13,backgroundColor:'#255444',alignItems:'center',justifyContent:'center'},
  grow:{flex:1},
  name:{color:C.white,fontWeight:'900'},
});
