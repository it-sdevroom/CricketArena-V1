import {ScrollView,StyleSheet,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {router} from 'expo-router';
import {Button,Card,Hero,Pill,StatTile} from '@/components/UI';
import {C} from '@/constants/theme';
import {fixtures,matchSummary,teams} from '@/data/demo';

export default function Home() {
  return (
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.top}>
        <View>
          <Text style={s.hello}>MATCHDAY CONTROL</Text>
          <Text style={s.name}>Cricket Arena</Text>
        </View>
        <View style={s.avatar}><Ionicons name="trophy" color={C.lime} size={22}/></View>
      </View>

      <Hero eyebrow="RIYADH PREMIER LEAGUE" title="Run the whole tournament from one app." subtitle="Score every ball, publish fixtures, manage teams, follow stats, chat with officials and keep fans in the loop."/>

      <View style={s.metrics}>
        <StatTile value="8" label="Teams"/>
        <StatTile value="15" label="Fixtures"/>
        <StatTile value="120" label="Players"/>
        <StatTile value="Live" label="Scoring"/>
      </View>

      <View style={s.row}>
        <Text style={s.h2}>Live now</Text>
        <Pill text="LIVE" tone="red"/>
      </View>
      <Card>
        <View style={s.matchHead}>
          <Text style={s.league}>{fixtures[0].stage}</Text>
          <Text style={s.over}>{matchSummary.overs} overs</Text>
        </View>
        <View style={s.scoreRow}>
          <View>
            <Text style={s.team}>{matchSummary.battingTeam}</Text>
            <Text style={s.score}>{matchSummary.score}</Text>
          </View>
          <Text style={s.vs}>VS</Text>
          <View style={s.right}>
            <Text style={s.team}>{matchSummary.bowlingTeam}</Text>
            <Text style={s.chase}>{matchSummary.chase}</Text>
          </View>
        </View>
        <Button title="Open live scorer" onPress={()=>router.push('/scorer')}/>
      </Card>

      <Text style={s.h2}>Quick actions</Text>
      <View style={s.grid}>
        {[
          ['add-circle','New match'],
          ['people','Teams'],
          ['calendar','Fixtures'],
          ['chatbubbles','Officials chat'],
        ].map(item=>(
          <Card key={item[1]} style={s.quick}>
            <Ionicons name={item[0] as any} color={C.green} size={24}/>
            <Text style={s.qtext}>{item[1]}</Text>
          </Card>
        ))}
      </View>

      <View style={s.row}>
        <Text style={s.h2}>Points table</Text>
        <Text style={s.link}>Top 3</Text>
      </View>
      {teams.slice(0,3).map((t,i)=>(
        <View style={s.tableRow} key={t.id}>
          <Text style={s.rank}>{i + 1}</Text>
          <View style={[s.dot,{backgroundColor:t.color}]}/>
          <Text style={s.tname}>{t.name}</Text>
          <Text style={s.meta}>{t.won}-{t.lost}</Text>
          <Text style={s.points}>{t.pts} pts</Text>
        </View>
      ))}

      <Text style={s.h2}>Next fixture</Text>
      <Card>
        <Text style={s.league}>{fixtures[1].date}</Text>
        <Text style={s.next}>{fixtures[1].a} <Text style={s.dim}>vs</Text> {fixtures[1].b}</Text>
        <Text style={s.meta}>{fixtures[1].venue}</Text>
      </Card>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page:{padding:18,paddingTop:58,paddingBottom:110,backgroundColor:C.bg},
  top:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:20},
  hello:{color:C.green,fontWeight:'900',fontSize:11,letterSpacing:1.5},
  name:{color:C.white,fontWeight:'900',fontSize:22},
  avatar:{width:44,height:44,borderRadius:15,backgroundColor:C.card2,alignItems:'center',justifyContent:'center'},
  metrics:{flexDirection:'row',flexWrap:'wrap',gap:10},
  row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:22,marginBottom:12},
  h2:{color:C.white,fontSize:19,fontWeight:'900'},
  matchHead:{flexDirection:'row',justifyContent:'space-between'},
  league:{color:C.green,fontWeight:'900',fontSize:12},
  over:{color:C.muted},
  scoreRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginVertical:20,gap:10},
  team:{color:C.white,fontWeight:'800'},
  score:{color:C.white,fontSize:31,fontWeight:'900',marginTop:5},
  chase:{color:C.amber,fontWeight:'800',marginTop:8},
  vs:{color:C.muted,fontWeight:'900'},
  right:{alignItems:'flex-end',flex:1},
  grid:{flexDirection:'row',flexWrap:'wrap',gap:10},
  quick:{width:'48%',alignItems:'center',gap:8},
  qtext:{color:C.white,fontWeight:'800'},
  link:{color:C.green,fontWeight:'800'},
  tableRow:{height:58,borderBottomWidth:1,borderBottomColor:C.line,flexDirection:'row',alignItems:'center'},
  rank:{color:C.muted,width:24},
  dot:{width:10,height:10,borderRadius:5,marginRight:10},
  tname:{color:C.white,fontWeight:'800',flex:1},
  meta:{color:C.muted},
  points:{color:C.lime,fontWeight:'900',width:62,textAlign:'right'},
  next:{color:C.white,fontSize:23,fontWeight:'900',marginVertical:14},
  dim:{color:C.muted},
});
