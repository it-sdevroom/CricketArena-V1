import {useState} from 'react';
import {Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {Card,Pill} from '@/components/UI';
import {C} from '@/constants/theme';

export default function Chat() {
  const [text,setText] = useState('');
  const [msgs,setMsgs] = useState([
    {n:'Tournament Admin',t:'Welcome captains. Toss is scheduled at 7:00 PM.',me:false},
    {n:'Riyadh Falcons',t:'Team sheet submitted.',me:false},
    {n:'You',t:'Scorer and match officials confirmed.',me:true},
  ]);

  function send() {
    if (!text.trim()) return;
    setMsgs(x=>[...x,{n:'You',t:text.trim(),me:true}]);
    setText('');
  }

  return (
    <View style={s.page}>
      <View style={s.head}>
        <View>
          <Text style={s.title}>RPL Officials</Text>
          <Text style={s.online}>12 members - 8 online</Text>
        </View>
        <Pill text="OFFICIAL"/>
      </View>
      <ScrollView contentContainerStyle={s.feed}>
        {msgs.map((m,i)=>(
          <Card key={`${m.n}-${i}`} style={[s.msg,m.me&&s.mine]}>
            <Text style={s.author}>{m.n}</Text>
            <Text style={s.body}>{m.t}</Text>
            <Text style={s.time}>7:{12 + i * 4} PM</Text>
          </Card>
        ))}
      </ScrollView>
      <View style={s.compose}>
        <TextInput value={text} onChangeText={setText} placeholder="Write a message..." placeholderTextColor={C.muted} style={s.input}/>
        <Pressable onPress={send} style={s.send}><Ionicons name="send" color="#052117" size={20}/></Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  page:{flex:1,backgroundColor:C.bg},
  head:{padding:18,flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderBottomWidth:1,borderBottomColor:C.line},
  title:{color:C.white,fontWeight:'900',fontSize:20},
  online:{color:C.green,fontSize:12,marginTop:4},
  feed:{padding:18,gap:10},
  msg:{maxWidth:'83%'},
  mine:{alignSelf:'flex-end',backgroundColor:'#174A39'},
  author:{color:C.green,fontWeight:'800',fontSize:12},
  body:{color:C.white,lineHeight:20,marginTop:4},
  time:{color:C.muted,fontSize:10,textAlign:'right',marginTop:5},
  compose:{padding:12,flexDirection:'row',gap:9,borderTopWidth:1,borderTopColor:C.line},
  input:{flex:1,backgroundColor:C.card,color:C.white,borderRadius:16,paddingHorizontal:15},
  send:{width:48,height:48,borderRadius:16,backgroundColor:C.green,alignItems:'center',justifyContent:'center'},
});
